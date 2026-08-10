import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  decodeRoommateMessageCursor,
  encodeRoommateMessageCursor,
  type MarkRoommateConversationReadDto,
  type RoommateMessagePageQueryDto,
  type SendRoommateMessageDto
} from "./dto";
import {
  ROOMMATE_CONVERSATION_EVENTS,
  type RoommateConversationEvents
} from "./roommate-conversation-events";
import { RoommateMessageRateLimiter } from "./roommate-message-rate-limit";

type MessageRecord = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: Date;
};

type MemberRecord = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
  conversation: {
    id: string;
    matchId: string;
    lastMessageAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    match: { id: string; status: "ACTIVE" | "CLOSED" };
    members: Array<{
      userId: string;
      lastReadMessageId: string | null;
      lastReadAt: Date | null;
      user: {
        id: string;
        roommateProfile: {
          id: string;
          name: string;
          age: number;
          role: string;
          image: string;
          match: number;
          budget: string;
          commute: string;
          tags: string[];
        } | null;
      };
    }>;
    messages?: MessageRecord[];
  };
};

export type RoommateConversationSummary = {
  id: string;
  matchId: string;
  peer: {
    id: string;
    profileId: string | null;
    name: string | null;
    age: number | null;
    role: string | null;
    image: string | null;
    match: number | null;
    budget: string | null;
    commute: string | null;
    tags: string[];
  };
  latestMessage: ReturnType<typeof serializeMessage> | null;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
  peerLastReadMessageId: string | null;
  peerLastReadAt: Date | null;
  writable: boolean;
  lastMessageAt: Date | null;
  updatedAt: Date;
};

@Injectable()
export class RoommateConversationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ROOMMATE_CONVERSATION_EVENTS) private readonly events: RoommateConversationEvents,
    @Inject(RoommateMessageRateLimiter) private readonly rateLimiter: RoommateMessageRateLimiter
  ) {}

  async listForUser(userId: string): Promise<RoommateConversationSummary[]> {
    const memberships = (await this.prisma.roommateConversationMember.findMany({
      where: { userId },
      include: conversationInclude(true)
    })) as unknown as MemberRecord[];

    const summaries = await Promise.all(
      memberships.map(async (membership) => {
        const peerMember = membership.conversation.members.find((member) => member.userId !== userId);
        const profile = peerMember?.user.roommateProfile ?? null;
        const unreadCount = await this.prisma.roommateMessage.count({
          where: {
            conversationId: membership.conversationId,
            senderId: { not: userId },
            ...messagesAfter(membership.lastReadAt, membership.lastReadMessageId)
          }
        });
        const latestMessage = membership.conversation.messages?.[0] ?? null;

        return {
          id: membership.conversation.id,
          matchId: membership.conversation.matchId,
          peer: {
            id: peerMember?.user.id ?? "",
            profileId: profile?.id ?? null,
            name: profile?.name ?? null,
            age: profile?.age ?? null,
            role: profile?.role ?? null,
            image: profile?.image ?? null,
            match: profile?.match ?? null,
            budget: profile?.budget ?? null,
            commute: profile?.commute ?? null,
            tags: profile?.tags ?? []
          },
          latestMessage: latestMessage ? serializeMessage(latestMessage) : null,
          unreadCount,
          lastReadMessageId: membership.lastReadMessageId,
          lastReadAt: membership.lastReadAt,
          peerLastReadMessageId: peerMember?.lastReadMessageId ?? null,
          peerLastReadAt: peerMember?.lastReadAt ?? null,
          writable: membership.conversation.match.status === "ACTIVE",
          lastMessageAt: membership.conversation.lastMessageAt,
          updatedAt: membership.conversation.updatedAt
        };
      })
    );

    return summaries.sort(
      (left, right) =>
        (right.lastMessageAt ?? right.updatedAt).getTime() - (left.lastMessageAt ?? left.updatedAt).getTime()
    );
  }

  async listMessages(userId: string, conversationId: string, query: Partial<RoommateMessagePageQueryDto>) {
    await this.findMembership(userId, conversationId);
    const limit = query.limit ?? 50;
    const cursor = query.cursor ? decodeRoommateMessageCursor(query.cursor) : null;
    const rows = (await this.prisma.roommateMessage.findMany({
      where: {
        conversationId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1
    })) as MessageRecord[];
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).map(serializeMessage);
    const last = messages.at(-1);

    return {
      messages,
      nextCursor: hasMore && last ? encodeRoommateMessageCursor({ createdAt: last.createdAt, id: last.id }) : null
    };
  }

  async sendMessage(userId: string, conversationId: string, dto: SendRoommateMessageDto) {
    const membership = await this.findMembership(userId, conversationId);
    if (membership.conversation.match.status !== "ACTIVE") {
      throw new BadRequestException("Roommate conversation is read-only");
    }

    const body = typeof dto.body === "string" ? dto.body.trim() : "";
    if (!body || body.length > 2000) throw new BadRequestException("Message body must contain 1 to 2000 characters");

    const existing = (await this.prisma.roommateMessage.findUnique({
      where: { senderId_clientMessageId: { senderId: userId, clientMessageId: dto.clientMessageId } }
    })) as MessageRecord | null;
    if (existing) {
      if (existing.conversationId !== conversationId) throw new BadRequestException("clientMessageId was already used");
      return serializeMessage(existing);
    }

    await this.rateLimiter.consume({ userId, conversationId, now: new Date() });

    let created: MessageRecord;
    try {
      created = (await this.prisma.$transaction(async (transaction) => {
        const message = (await transaction.roommateMessage.create({
          data: { conversationId, senderId: userId, clientMessageId: dto.clientMessageId, body }
        })) as MessageRecord;
        await transaction.roommateConversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: message.createdAt }
        });
        return message;
      })) as MessageRecord;
    } catch (error) {
      if (!isSenderClientMessageUniqueConflict(error)) throw error;
      const winner = (await this.prisma.roommateMessage.findUnique({
        where: { senderId_clientMessageId: { senderId: userId, clientMessageId: dto.clientMessageId } }
      })) as MessageRecord | null;
      if (!winner || winner.conversationId !== conversationId) throw error;
      return serializeMessage(winner);
    }

    const message = serializeMessage(created);
    await this.publishBestEffort({
      name: "roommate.message.created",
      userIds: membership.conversation.members.map((member) => member.userId),
      payload: { conversationId, message }
    });
    return message;
  }

  async markRead(userId: string, conversationId: string, dto: MarkRoommateConversationReadDto) {
    const membership = await this.findMembership(userId, conversationId);
    const target = (await this.prisma.roommateMessage.findUnique({ where: { id: dto.lastReadMessageId } })) as MessageRecord | null;
    if (!target || target.conversationId !== conversationId) throw new NotFoundException("Roommate message not found");

    const updated = await this.prisma.roommateConversationMember.updateMany({
      where: {
        id: membership.id,
        OR: [
          { lastReadAt: null },
          { lastReadAt: { lt: target.createdAt } },
          { lastReadAt: target.createdAt, lastReadMessageId: { lt: target.id } }
        ]
      },
      data: { lastReadMessageId: target.id, lastReadAt: target.createdAt }
    });
    const current = await this.findMembership(userId, conversationId);
    const state = {
      conversationId,
      userId,
      lastReadMessageId: current.lastReadMessageId,
      lastReadAt: current.lastReadAt
    };

    if (updated.count > 0) {
      await this.publishBestEffort({
        name: "roommate.message.read",
        userIds: current.conversation.members.map((member) => member.userId),
        payload: state
      });
    }
    return state;
  }

  private async findMembership(userId: string, conversationId: string): Promise<MemberRecord> {
    const membership = (await this.prisma.roommateConversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
      include: conversationInclude(false)
    })) as unknown as MemberRecord | null;
    if (!membership) throw new NotFoundException("Roommate conversation not found");
    return membership;
  }

  private async publishBestEffort(event: Parameters<RoommateConversationEvents["publish"]>[0]) {
    try {
      await this.events.publish(event);
    } catch {
      // PostgreSQL has already committed. Realtime delivery is best effort.
    }
  }
}

function conversationInclude(withLatestMessage: boolean): Prisma.RoommateConversationMemberInclude {
  const include: Prisma.RoommateConversationMemberInclude = {
    conversation: {
      include: {
        match: true,
        members: {
          include: {
            user: { include: { roommateProfile: true } }
          }
        }
      }
    }
  };
  if (withLatestMessage && typeof include.conversation === "object" && include.conversation.include) {
    include.conversation.include.messages = { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 };
  }
  return include;
}

function messagesAfter(lastReadAt: Date | null, lastReadMessageId: string | null) {
  if (!lastReadAt || !lastReadMessageId) return {};
  return {
    OR: [
      { createdAt: { gt: lastReadAt } },
      { createdAt: lastReadAt, id: { gt: lastReadMessageId } }
    ]
  };
}

function serializeMessage(message: MessageRecord) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    clientMessageId: message.clientMessageId,
    body: message.body,
    createdAt: message.createdAt
  };
}

function isSenderClientMessageUniqueConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) && target.includes("senderId") && target.includes("clientMessageId");
}
