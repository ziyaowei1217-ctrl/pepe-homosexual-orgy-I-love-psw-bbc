import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ViewingMode, ViewingRequestStatus } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { CreateDealThreadDto, CreateViewingRequestDto, SendDealMessageDto, ViewingModeDtoValue } from "./dto";

const threadInclude = {
  messages: { orderBy: { createdAt: "asc" as const } },
  viewingRequests: { orderBy: { createdAt: "asc" as const } }
};

@Injectable()
export class DealThreadsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findForUser(userId: string) {
    const threads = await this.prisma.dealThread.findMany({
      where: { OR: [{ ownerId: userId }, { listingOwnerId: userId }] },
      include: threadInclude,
      orderBy: { updatedAt: "desc" }
    });
    return threads.map((thread) => this.toThreadResponse(thread, userId));
  }

  async createOrFindThread(renterId: string, dto: CreateDealThreadDto) {
    const listingId = dto.listingId.trim();
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, status: "APPROVED" }
    });
    if (!listing || listing.ownerId === renterId) throw new NotFoundException("Listing not found");

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

    const renterName = await this.displayNameForUser(renterId);
    const hostName = await this.displayNameForUser(listing.ownerId);
    const thread = await this.prisma.dealThread.upsert({
      where: { ownerId_listingId: { ownerId: renterId, listingId } },
      create: {
        ownerId: renterId,
        listingOwnerId: listing.ownerId,
        dealRoomId: requestedDealRoomId,
        listingId,
        listingTitle: listing.title,
        area: listing.area,
        contactName: hostName,
        participantNames: [renterName]
      },
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
    await this.prisma.dealMessage.create({
      data: {
        threadId,
        senderId: userId,
        senderName: await this.displayNameForUser(userId),
        body,
        align: "right",
        status: "sent"
      }
    });
    return this.reloadForViewer(userId, thread.id);
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
    const active = await this.prisma.viewingRequest.findFirst({
      where: { threadId, status: { in: ["REQUESTED", "CONFIRMED"] } },
      orderBy: { updatedAt: "desc" }
    });
    if (active) {
      await this.prisma.viewingRequest.update({ where: { id: active.id }, data });
    } else {
      await this.prisma.viewingRequest.create({ data: { threadId, ...data } });
    }
    await this.prisma.dealMessage.create({
      data: {
        threadId,
        senderId: renterId,
        senderName: await this.displayNameForUser(renterId),
        body: `${active ? "调整看房时间至" : "请求看房"} ${data.timeLabel}（${dto.mode === "video" ? "视频" : "线下"}）`,
        align: "right",
        status: "sent"
      }
    });
    return this.reloadForViewer(renterId, threadId);
  }

  confirmViewingRequest(hostId: string, threadId: string, requestId: string) {
    return this.decideViewingRequest(hostId, threadId, requestId, "CONFIRMED");
  }

  declineViewingRequest(hostId: string, threadId: string, requestId: string) {
    return this.decideViewingRequest(hostId, threadId, requestId, "CANCELLED");
  }

  private async decideViewingRequest(
    hostId: string,
    threadId: string,
    requestId: string,
    nextStatus: "CONFIRMED" | "CANCELLED"
  ) {
    const thread = await this.prisma.dealThread.findFirst({
      where: { id: threadId, OR: [{ listingOwnerId: hostId }] },
      include: threadInclude
    });
    if (!thread) throw new NotFoundException("Deal thread not found");
    const request = await this.prisma.viewingRequest.findUnique({ where: { id: requestId } });
    if (!request || request.threadId !== threadId) throw new NotFoundException("Viewing request not found");
    const allowed =
      nextStatus === "CONFIRMED"
        ? request.status === "REQUESTED"
        : request.status === "REQUESTED" || request.status === "CONFIRMED";
    if (!allowed) throw new BadRequestException("Viewing request cannot transition from its current status");
    await this.prisma.viewingRequest.update({ where: { id: requestId }, data: { status: nextStatus } });
    await this.prisma.dealMessage.create({
      data: {
        threadId,
        senderId: hostId,
        senderName: await this.displayNameForUser(hostId),
        body: nextStatus === "CONFIRMED" ? `已确认看房：${request.timeLabel}` : `已拒绝看房请求：${request.timeLabel}`,
        align: "right",
        status: "sent"
      }
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

  private toThreadResponse(thread: any, viewerId: string) {
    const viewerRole = thread.ownerId === viewerId ? "renter" : "host";
    return {
      ...thread,
      viewerRole,
      contactName: viewerRole === "renter" ? thread.contactName : thread.participantNames[0] ?? "Renter",
      messages: (thread.messages ?? []).map((message: any) => ({
        ...message,
        align: message.senderId === viewerId ? "right" : "left",
        status: message.senderId === viewerId ? "sent" : "received"
      })),
      viewingRequests: (thread.viewingRequests ?? []).map((request: any) => ({
        ...request,
        mode: request.mode === "VIDEO" ? "video" : "in-person"
      }))
    };
  }
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
