import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, ViewingMode, ViewingRequestStatus, type DealMessage, type ViewingRequest } from "@prisma/client";
import { isUUID } from "class-validator";

import { PrismaService } from "../prisma/prisma.service";
import { LocalRoommateMessageRateLimiter, RoommateMessageRateLimiter } from "../roommate-conversations/roommate-message-rate-limit";
import { CreateDealThreadDto, CreateViewingRequestDto, SendDealMessageDto, ViewingModeDtoValue } from "./dto";
import {
  chronologicalHistoryPage, DEAL_MESSAGE_PREVIEW_LIMIT, DEAL_VIEWING_PREVIEW_LIMIT,
  historyBefore, parseDealMessageHistoryQuery
} from "./message-history";

const threadInclude = {
  // Every list, retry and write response uses bounded previews. Older messages
  // remain available through the participant-authorized cursor endpoint.
  messages: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: DEAL_MESSAGE_PREVIEW_LIMIT + 1 },
  viewingRequests: { orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }], take: DEAL_VIEWING_PREVIEW_LIMIT }
};

@Injectable()
export class DealThreadsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RoommateMessageRateLimiter) private readonly messageRateLimiter: RoommateMessageRateLimiter = new LocalRoommateMessageRateLimiter()
  ) {}

  async findForUser(userId: string) {
    const threads = await this.prisma.dealThread.findMany({
      where: { OR: [{ ownerId: userId }, { listingOwnerId: userId }] },
      include: { ...threadInclude, messages: { ...threadInclude.messages, take: 2 } },
      orderBy: { updatedAt: "desc" }
    });
    if (!threads.length) return [];
    // One current-state query for the whole inbox, rather than one per thread.
    const currentRequests = await this.prisma.$queryRaw<ViewingRequest[]>(Prisma.sql`
      SELECT DISTINCT ON ("threadId") * FROM "ViewingRequest"
      WHERE "threadId" IN (${Prisma.join(threads.map(thread => thread.id))}) AND "status" IN ('REQUESTED', 'CONFIRMED')
      ORDER BY "threadId", "updatedAt" DESC, "id" DESC
    `);
    const currentByThread = new Map(currentRequests.map(request => [request.threadId, request]));
    return Promise.all(threads.map((thread) => this.toThreadResponse(thread, userId, 1, currentByThread.get(thread.id) ?? null)));
  }

  async createOrFindThread(renterId: string, dto: CreateDealThreadDto) {
    return this.createOrFindThreadForContext(renterId, dto);
  }

  // Internal completion of an already authorized submission; no public route
  // accepts this context. A draft (including a withdrawn draft) cannot use it.
  async createOrFindApplicationThread(renterId: string, applicationId: string) {
    const application = await this.prisma.rentalApplication.findUnique({ where: { id: applicationId } });
    if (!application || application.submitterId !== renterId || !application.submitKey || !application.submittedAt ||
      application.listingOwnerId === renterId) {
      throw new NotFoundException("Submitted rental application not found");
    }
    const members = Array.isArray(application.memberSnapshots) ? application.memberSnapshots : [];
    if (members.some(member => member && typeof member === "object" && !Array.isArray(member) && member.userId === application.listingOwnerId)) {
      throw new NotFoundException("Submitted rental application not found");
    }
    return this.createOrFindThreadForContext(renterId, { listingId: application.listingId }, application.listingOwnerId);
  }

  private async createOrFindThreadForContext(renterId: string, dto: CreateDealThreadDto, submittedListingOwnerId?: string) {
    const listingId = dto.listingId.trim();
    const existing = await this.prisma.dealThread.findUnique({
      where: { ownerId_listingId: { ownerId: renterId, listingId } },
      include: threadInclude
    });
    const requestedDealRoomId = await this.resolveOwnedDealRoomId(renterId, dto.dealRoomId);
    if (
      existing?.dealRoomId &&
      requestedDealRoomId &&
      existing.dealRoomId !== requestedDealRoomId
    ) {
      throw new ConflictException("Deal thread is already bound to another deal room");
    }

    // The composite lookup authorizes this renter. Replaying a completed request
    // reads its original conversation even when the listing is no longer public.
    if (existing && (!requestedDealRoomId || existing.dealRoomId === requestedDealRoomId)) {
      return this.toThreadResponse(existing, renterId);
    }

    const listing = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        ...(submittedListingOwnerId ? { ownerId: submittedListingOwnerId } : { status: "APPROVED" as const })
      }
    });
    if (!listing || listing.ownerId === renterId) throw new NotFoundException("Listing not found");

    const renterName = await this.displayNameForUser(renterId);
    const hostName = await this.displayNameForUser(listing.ownerId);
    const identity = { ownerId_listingId: { ownerId: renterId, listingId } };
    const data = {
      ownerId: renterId,
      listingOwnerId: listing.ownerId,
      dealRoomId: requestedDealRoomId,
      listingId,
      listingTitle: listing.title,
      area: listing.area,
      contactName: hostName,
      participantNames: [renterName]
    };
    if (submittedListingOwnerId) {
      try {
        const thread = await this.prisma.dealThread.create({ data, include: threadInclude });
        return this.toThreadResponse(thread, renterId);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        // Another completion (or ordinary conversation creation) won after our
        // read. Preserve that conversation and verify its persisted participants.
        const winner = await this.prisma.dealThread.findUnique({ where: identity, include: threadInclude });
        if (!winner || winner.listingOwnerId !== submittedListingOwnerId) throw error;
        return this.toThreadResponse(winner, renterId);
      }
    }
    const thread = await this.prisma.dealThread.upsert({
      where: identity,
      create: data,
      update: {
        dealRoomId: existing?.dealRoomId ?? requestedDealRoomId,
        listingOwnerId: listing.ownerId,
        listingTitle: listing.title,
        area: listing.area,
        contactName: hostName,
        participantNames: [renterName]
      },
      include: threadInclude
    });
    return this.toThreadResponse(thread, renterId);
  }

  async sendMessage(userId: string, threadId: string, dto: SendDealMessageDto) {
    const thread = await this.requireParticipantThread(userId, threadId);
    const body = dto.body.trim();
    if (!body) throw new BadRequestException("Message body is required");
    if (!isUUID(dto.clientMessageId)) throw new BadRequestException("A client message UUID is required");
    const clientMessageId = dto.clientMessageId.toLowerCase();
    const where = { senderId_clientMessageId: { senderId: userId, clientMessageId } };
    const assertSameMessage = (message: { threadId: string; body: string }) => {
      if (message.threadId !== threadId || message.body !== body) {
        throw new ConflictException("Client message ID is already bound to another message");
      }
    };
    const existing = await this.prisma.dealMessage.findUnique({ where });
    if (existing) {
      assertSameMessage(existing);
    } else {
      // Authorize and recover committed retries first; only a new write consumes quota.
      await this.messageRateLimiter.consume({ userId, conversationId: `deal:${threadId}` });
      try {
        await this.prisma.dealMessage.create({
          data: {
            threadId,
            senderId: userId,
            clientMessageId,
            senderName: await this.displayNameForUser(userId),
            body,
            align: "right",
            status: "sent"
          }
        });
      } catch (error) {
        // A concurrent retry can win after our read; the database owns the identity.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const winner = await this.prisma.dealMessage.findUnique({ where });
        if (!winner) throw error;
        assertSameMessage(winner);
      }
    }
    return this.reloadForViewer(userId, thread.id);
  }

  async listMessages(userId: string, threadId: string, query: Record<string, unknown> = {}) {
    const authorized = await this.prisma.dealThread.findFirst({
      where: { id: threadId, OR: [{ ownerId: userId }, { listingOwnerId: userId }] }, select: { id: true }
    });
    if (!authorized) throw new NotFoundException("Deal thread not found");
    const { limit, cursor } = parseDealMessageHistoryQuery(query);
    const rows = await this.prisma.dealMessage.findMany({
      where: { threadId, ...historyBefore(cursor) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1
    });
    const page = chronologicalHistoryPage(rows, limit);
    return { messages: page.messages.map(message => presentDealMessage(message, userId)), nextCursor: page.nextCursor };
  }

  async createViewingRequest(renterId: string, threadId: string, dto: CreateViewingRequestDto) {
    const thread = await this.requireRenterThread(renterId, threadId);
    const participantNames = uniqueNames(dto.participantNames);
    if (!participantNames.length) throw new BadRequestException("At least one viewing participant is required");
    const data = {
      requesterId: renterId,
      listingId: thread.listingId,
      listingTitle: thread.listingTitle,
      area: thread.area,
      timeLabel: dto.timeLabel.trim(),
      iso: new Date(dto.iso),
      mode: toPrismaViewingMode(dto.mode),
      participantNames,
      status: ViewingRequestStatus.REQUESTED
    };
    const senderName = await this.displayNameForUser(renterId);
    await this.prisma.$transaction(async (transaction) => {
      // Serialize creators even when no active request exists. NO KEY UPDATE
      // remains compatible with the KEY SHARE lock a host message FK needs.
      await transaction.$queryRaw`SELECT "id" FROM "DealThread" WHERE "id" = ${threadId} FOR NO KEY UPDATE`;
      const active = await transaction.viewingRequest.findFirst({
        where: { threadId, status: { in: ["REQUESTED", "CONFIRMED"] } },
        orderBy: { updatedAt: "desc" }
      });
      // Replaying an unchanged request cannot flood the host with generated
      // messages or reset a confirmed viewing. Quota applies to actual changes.
      if (active && sameViewingRequest(active, data)) return;
      await this.messageRateLimiter.consume({ userId: renterId, conversationId: `deal:${threadId}` });
      if (active) {
        await transaction.viewingRequest.update({ where: { id: active.id }, data: { ...data, revision: { increment: 1 } } });
      } else {
        await transaction.viewingRequest.create({ data: { threadId, ...data } });
      }
      await transaction.dealMessage.create({
        data: {
          threadId,
          senderId: renterId,
          senderName,
          body: `${active ? "调整看房时间至" : "请求看房"} ${data.timeLabel}（${dto.mode === "video" ? "视频" : "线下"}）`,
          align: "right",
          status: "sent"
        }
      });
    });
    return this.reloadForViewer(renterId, threadId);
  }

  confirmViewingRequest(hostId: string, threadId: string, requestId: string, expectedRevision: number) {
    return this.decideViewingRequest(hostId, threadId, requestId, "CONFIRMED", expectedRevision);
  }

  declineViewingRequest(hostId: string, threadId: string, requestId: string, expectedRevision: number) {
    return this.decideViewingRequest(hostId, threadId, requestId, "CANCELLED", expectedRevision);
  }

  private async decideViewingRequest(
    hostId: string,
    threadId: string,
    requestId: string,
    nextStatus: "CONFIRMED" | "CANCELLED",
    expectedRevision: number
  ) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new BadRequestException("expectedRevision must be a positive integer");
    }
    const thread = await this.prisma.dealThread.findFirst({
      where: { id: threadId, OR: [{ listingOwnerId: hostId }] },
      include: threadInclude
    });
    if (!thread) throw new NotFoundException("Deal thread not found");
    const senderName = await this.displayNameForUser(hostId);
    await this.prisma.$transaction(async (transaction) => {
      const request = await transaction.viewingRequest.findUnique({ where: { id: requestId } });
      if (!request || request.threadId !== threadId) throw new NotFoundException("Viewing request not found");
      if (request.revision !== expectedRevision) throw new ConflictException("Viewing request changed; refresh before deciding");
      const allowed =
        nextStatus === "CONFIRMED"
          ? request.status === "REQUESTED"
          : request.status === "REQUESTED" || request.status === "CONFIRMED";
      if (!allowed) throw new BadRequestException("Viewing request cannot transition from its current status");
      await this.messageRateLimiter.consume({ userId: hostId, conversationId: `deal:${threadId}` });
      const changed = await transaction.viewingRequest.updateMany({
        where: { id: requestId, threadId, revision: expectedRevision, status: request.status },
        data: { status: nextStatus, revision: { increment: 1 } }
      });
      if (changed.count !== 1) throw new ConflictException("Viewing request changed; refresh before deciding");
      await transaction.dealMessage.create({
        data: {
          threadId,
          senderId: hostId,
          senderName,
          body: nextStatus === "CONFIRMED" ? `已确认看房：${request.timeLabel}` : `已拒绝看房请求：${request.timeLabel}`,
          align: "right",
          status: "sent"
        }
      });
    });
    return this.reloadForViewer(hostId, threadId);
  }

  private async requireParticipantThread(userId: string, threadId: string) {
    const thread = await this.prisma.dealThread.findFirst({
      where: { id: threadId, OR: [{ ownerId: userId }, { listingOwnerId: userId }] },
      include: threadInclude
    });
    if (!thread) throw new NotFoundException("Deal thread not found");
    return thread;
  }

  private async requireRenterThread(renterId: string, threadId: string) {
    const thread = await this.prisma.dealThread.findFirst({
      where: { id: threadId, OR: [{ ownerId: renterId }] },
      include: threadInclude
    });
    if (!thread || thread.ownerId !== renterId) throw new NotFoundException("Deal thread not found");
    return thread;
  }

  private async reloadForViewer(userId: string, threadId: string) {
    const thread = await this.requireParticipantThread(userId, threadId);
    return this.toThreadResponse(thread, userId);
  }

  private async resolveOwnedDealRoomId(ownerId: string, value?: string) {
    const id = cleanOptional(value);
    if (!id) return undefined;
    const room = await this.prisma.dealRoom.findFirst({ where: { id, ownerId, status: "ACTIVE" } });
    if (!room) throw new NotFoundException("Deal room not found");
    return id;
  }

  private async displayNameForUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    const profile = await this.prisma.profile.findUnique({ where: { email: user.email } });
    return profile?.displayName?.trim() || user.email.split("@")[0];
  }

  private async toThreadResponse(thread: any, viewerId: string, messageLimit = DEAL_MESSAGE_PREVIEW_LIMIT, currentRequest?: ViewingRequest | null) {
    const viewerRole = thread.ownerId === viewerId ? "renter" : "host";
    const page = chronologicalHistoryPage<DealMessage>(thread.messages ?? [], messageLimit);
    let viewingRequests = chronologicalHistoryPage<ViewingRequest>(thread.viewingRequests ?? [], DEAL_VIEWING_PREVIEW_LIMIT).messages;
    const current = currentRequest === undefined ? await this.prisma.viewingRequest.findFirst({
      where: { threadId: thread.id, status: { in: [ViewingRequestStatus.REQUESTED, ViewingRequestStatus.CONFIRMED] } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    }) : currentRequest;
    if (current) {
      // A legacy active request can be older than the preview window. Reserve
      // one slot for the latest writable state, replacing any stale snapshot.
      viewingRequests = chronologicalHistoryPage([
        ...viewingRequests.filter(request => request.id !== current.id).slice(-(DEAL_VIEWING_PREVIEW_LIMIT - 1)), current
      ], DEAL_VIEWING_PREVIEW_LIMIT).messages;
    }
    return {
      ...thread,
      viewerRole,
      contactName: viewerRole === "renter" ? thread.contactName : thread.participantNames[0] ?? "Renter",
      messages: page.messages.map(message => presentDealMessage(message, viewerId)),
      messagePageInfo: { nextCursor: page.nextCursor, hasMore: page.hasMore },
      viewingRequests: viewingRequests.map((request: any) => ({
        ...request,
        mode: request.mode === "VIDEO" ? "video" : "in-person"
      }))
    };
  }
}

function presentDealMessage<T extends { senderId: string | null }>(message: T, viewerId: string) {
  return {
    ...message,
    align: message.senderId === viewerId ? "right" : "left",
    status: message.senderId === viewerId ? "sent" : "received"
  };
}

function sameViewingRequest(
  current: { requesterId: string; listingId: string; timeLabel: string; iso: Date; mode: ViewingMode; participantNames: string[] },
  next: { requesterId: string; listingId: string; timeLabel: string; iso: Date; mode: ViewingMode; participantNames: string[] }
) {
  return current.requesterId === next.requesterId && current.listingId === next.listingId &&
    current.timeLabel === next.timeLabel && current.iso.getTime() === next.iso.getTime() && current.mode === next.mode &&
    current.participantNames.length === next.participantNames.length &&
    current.participantNames.every((name, index) => name === next.participantNames[index]);
}

function uniqueNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

function cleanOptional(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function toPrismaViewingMode(value: ViewingModeDtoValue) {
  return value === "video" ? ViewingMode.VIDEO : ViewingMode.IN_PERSON;
}
