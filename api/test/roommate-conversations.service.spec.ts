import { BadRequestException, HttpException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { encodeRoommateMessageCursor } from "../src/roommate-conversations/dto";
import {
  RoommateConversationsService,
  type RoommateConversationSummary
} from "../src/roommate-conversations/roommate-conversations.service";
import type {
  RoommateConversationEvent,
  RoommateConversationEvents
} from "../src/roommate-conversations/roommate-conversation-events";
import {
  LocalRoommateMessageRateLimiter,
  type RoommateMessageRateLimiter
} from "../src/roommate-conversations/roommate-message-rate-limit";

describe("RoommateConversationsService", () => {
  it("lists only member conversations with peer profile and unread count", async () => {
    const database = createConversationDatabase();
    database.addMessage({ id: "message-1", senderId: "user-b", body: "Already read", createdAt: at(1) });
    database.addMessage({ id: "message-2", senderId: "user-b", body: "Same-time unread", createdAt: at(1) });
    database.addMessage({ id: "message-3", senderId: "user-a", body: "Own message", createdAt: at(2) });
    database.addMessage({ id: "message-4", senderId: "user-b", body: "Newest unread", createdAt: at(3) });
    database.setReadCursor("user-a", "message-1");

    const summaries = await createService(database).listForUser("user-a");

    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toMatchObject({
      id: "conversation-a-b",
      matchId: "match-a-b",
      peer: { id: "user-b", name: "User B", image: "https://example.test/b.jpg" },
      latestMessage: { id: "message-4", body: "Newest unread" },
      unreadCount: 2,
      lastReadMessageId: "message-1",
      writable: true
    });
  });

  it("returns identical not-found errors for missing and inaccessible conversations", async () => {
    const service = createService(createConversationDatabase());

    const missing = await rejectionOf(service.listMessages("user-c", "missing", {}));
    const inaccessible = await rejectionOf(service.listMessages("user-c", "conversation-a-b", {}));

    expect(missing).toBeInstanceOf(NotFoundException);
    expect(inaccessible).toBeInstanceOf(NotFoundException);
    expect((missing as NotFoundException).getResponse()).toEqual((inaccessible as NotFoundException).getResponse());
    expect((missing as NotFoundException).getResponse()).toMatchObject({
      statusCode: 404,
      message: "Roommate conversation not found"
    });
  });

  it("pages messages by opaque createdAt/id cursor without gaps", async () => {
    const database = createConversationDatabase();
    database.addMessage({ id: "message-1", senderId: "user-a", body: "One", createdAt: at(1) });
    database.addMessage({ id: "message-2", senderId: "user-b", body: "Two", createdAt: at(2) });
    database.addMessage({ id: "message-3", senderId: "user-a", body: "Three", createdAt: at(2) });
    database.addMessage({ id: "message-4", senderId: "user-b", body: "Four", createdAt: at(3) });
    database.addMessage({ id: "message-5", senderId: "user-a", body: "Five", createdAt: at(4) });
    const service = createService(database);

    const first = await service.listMessages("user-a", "conversation-a-b", { limit: 2 });
    const second = await service.listMessages("user-a", "conversation-a-b", { limit: 2, cursor: first.nextCursor! });
    const third = await service.listMessages("user-a", "conversation-a-b", { limit: 2, cursor: second.nextCursor! });

    expect(first.messages.map((message) => message.id)).toEqual(["message-5", "message-4"]);
    expect(second.messages.map((message) => message.id)).toEqual(["message-3", "message-2"]);
    expect(third.messages.map((message) => message.id)).toEqual(["message-1"]);
    expect(third.nextCursor).toBeNull();
    await expect(
      service.listMessages("user-a", "conversation-a-b", { limit: 2, cursor: "not-a-cursor" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deduplicates repeated clientMessageId for the same sender", async () => {
    const database = createConversationDatabase();
    const service = createService(database);
    const command = { clientMessageId: "2e63b9fe-9120-4f26-9f52-28cf3ec797fd", body: "  Hello  " };

    const first = await service.sendMessage("user-a", "conversation-a-b", command);
    const retried = await service.sendMessage("user-a", "conversation-a-b", command);

    expect(retried.id).toBe(first.id);
    expect(retried.body).toBe("Hello");
    expect(database.messages).toHaveLength(1);
  });

  it("returns the winning row when concurrent insertion loses the client-message unique race", async () => {
    const database = createConversationDatabase({ loseNextMessageRace: true });
    const service = createService(database);

    const result = await service.sendMessage("user-a", "conversation-a-b", {
      clientMessageId: "714a074f-c4a4-4b47-8068-9f79cfaa137c",
      body: "One durable message"
    });

    expect(result).toMatchObject({ id: "message-race-winner", body: "One durable message" });
    expect(database.messages).toHaveLength(1);
  });

  it("rejects empty, over-2000-character, and closed-match sends", async () => {
    const database = createConversationDatabase();
    const service = createService(database);
    const clientMessageId = "992c3a73-beb4-474a-901d-6bd39819ecee";

    await expect(service.sendMessage("user-a", "conversation-a-b", { clientMessageId, body: "   " })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.sendMessage("user-a", "conversation-a-b", { clientMessageId, body: "x".repeat(2001) })
    ).rejects.toBeInstanceOf(BadRequestException);
    database.match.status = "CLOSED";
    await expect(
      service.sendMessage("user-a", "conversation-a-b", { clientMessageId, body: "Cannot send" })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.messages).toHaveLength(0);
  });

  it("publishes only after the message transaction commits", async () => {
    const database = createConversationDatabase();
    const publishCommitStates: boolean[] = [];
    const events: RoommateConversationEvents = {
      publish: async () => {
        publishCommitStates.push(database.transactionCommitted);
      }
    };
    const service = createService(database, events);

    await service.sendMessage("user-a", "conversation-a-b", {
      clientMessageId: "01410816-98c3-4365-b461-396576b45a5b",
      body: "Committed first"
    });

    expect(publishCommitStates).toEqual([true]);
  });

  it("keeps a committed send successful when publishing fails", async () => {
    const database = createConversationDatabase();
    const events: RoommateConversationEvents = {
      publish: async () => {
        throw new Error("transport unavailable");
      }
    };
    const service = createService(database, events);

    const message = await service.sendMessage("user-a", "conversation-a-b", {
      clientMessageId: "f49473b6-b2b9-41ca-89e8-b8da85d886f2",
      body: "Still durable"
    });

    expect(message).toMatchObject({ body: "Still durable" });
    expect(database.messages).toEqual([expect.objectContaining({ id: message.id })]);
  });

  it("advances read state monotonically and publishes the new cursor", async () => {
    const database = createConversationDatabase();
    database.addMessage({ id: "message-1", senderId: "user-b", body: "Older", createdAt: at(1) });
    database.addMessage({ id: "message-2", senderId: "user-b", body: "Newer", createdAt: at(2) });
    const published: RoommateConversationEvent[] = [];
    const service = createService(database, { publish: async (event) => void published.push(event) });

    const advanced = await service.markRead("user-a", "conversation-a-b", { lastReadMessageId: "message-2" });
    const stale = await service.markRead("user-a", "conversation-a-b", { lastReadMessageId: "message-1" });

    expect(advanced).toMatchObject({ lastReadMessageId: "message-2", lastReadAt: at(2) });
    expect(stale).toEqual(advanced);
    expect(database.memberFor("user-a")).toMatchObject({ lastReadMessageId: "message-2", lastReadAt: at(2) });
    expect(published).toEqual([
      expect.objectContaining({ name: "roommate.message.read", payload: expect.objectContaining({ lastReadMessageId: "message-2" }) })
    ]);
  });

  it("enforces a 20-message sliding window per user and conversation", async () => {
    let now = 1_000_000;
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => now });
    const request = { userId: "user-a", conversationId: "conversation-a-b" };

    for (let index = 0; index < 20; index += 1) await limiter.consume(request);
    const rejected = await rejectionOf(limiter.consume(request));

    expect(rejected).toBeInstanceOf(HttpException);
    expect((rejected as HttpException).getStatus()).toBe(429);
    expect((rejected as HttpException).getResponse()).toMatchObject({ retryAfterSeconds: 60 });
    now += 60_001;
    await expect(limiter.consume(request)).resolves.toBeUndefined();
  });

  it("rejects a read cursor message from another conversation", async () => {
    const database = createConversationDatabase();
    database.addMessage({
      id: "other-message",
      conversationId: "conversation-other",
      senderId: "user-b",
      body: "Not in this conversation",
      createdAt: at(1)
    });

    await expect(
      createService(database).markRead("user-a", "conversation-a-b", { lastReadMessageId: "other-message" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

function createService(
  database: ReturnType<typeof createConversationDatabase>,
  events: RoommateConversationEvents = { publish: async () => undefined },
  limiter: RoommateMessageRateLimiter = { consume: async () => undefined }
) {
  return new RoommateConversationsService(database.prisma as never, events, limiter);
}

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function at(second: number) {
  return new Date(`2026-08-09T00:00:${second.toString().padStart(2, "0")}.000Z`);
}

type Match = { id: string; status: "ACTIVE" | "CLOSED" };
type Conversation = { id: string; matchId: string; lastMessageAt: Date | null; createdAt: Date; updatedAt: Date };
type Member = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadMessageId: string | null;
  lastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: Date;
};

function createConversationDatabase(options: { loseNextMessageRace?: boolean } = {}) {
  const match: Match = { id: "match-a-b", status: "ACTIVE" };
  const conversation: Conversation = {
    id: "conversation-a-b",
    matchId: match.id,
    lastMessageAt: null,
    createdAt: at(0),
    updatedAt: at(0)
  };
  const members: Member[] = [member("member-a", "user-a"), member("member-b", "user-b")];
  const users = [
    user("user-a", "User A", "https://example.test/a.jpg"),
    user("user-b", "User B", "https://example.test/b.jpg"),
    user("user-c", "User C", "https://example.test/c.jpg")
  ];
  const messages: Message[] = [];
  let messageSequence = 0;
  let transactionCommitted = true;
  let loseNextMessageRace = options.loseNextMessageRace ?? false;

  function memberView(record: Member) {
    return {
      ...record,
      conversation: {
        ...conversation,
        match: { ...match },
        members: members.map((item) => ({ ...item, user: users.find((candidate) => candidate.id === item.userId) })),
        messages: [...messages]
          .filter((message) => message.conversationId === conversation.id)
          .sort(compareMessagesNewestFirst)
          .slice(0, 1)
      }
    };
  }

  const transaction = {
    roommateMessage: {
      create: async ({ data }: { data: Omit<Message, "id" | "createdAt"> }) => {
        if (loseNextMessageRace) {
          loseNextMessageRace = false;
          const winning = {
            id: "message-race-winner",
            createdAt: at(10),
            ...data
          };
          messages.push(winning);
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint", {
            code: "P2002",
            clientVersion: "test",
            meta: { target: ["senderId", "clientMessageId"] }
          });
        }
        const created = { id: `message-${++messageSequence}`, createdAt: at(10 + messageSequence), ...data };
        messages.push(created);
        return created;
      }
    },
    roommateConversation: {
      update: async ({ data }: { where: { id: string }; data: { lastMessageAt: Date } }) => {
        conversation.lastMessageAt = data.lastMessageAt;
        conversation.updatedAt = data.lastMessageAt;
        return conversation;
      }
    }
  };

  const prisma = {
    $transaction: async <T>(operation: (client: typeof transaction) => Promise<T>) => {
      transactionCommitted = false;
      try {
        const result = await operation(transaction);
        transactionCommitted = true;
        return result;
      } catch (error) {
        transactionCommitted = true;
        throw error;
      }
    },
    roommateConversationMember: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        members.filter((item) => item.userId === where.userId).map(memberView),
      findUnique: async ({ where }: { where: { conversationId_userId: { conversationId: string; userId: string } } }) => {
        const key = where.conversationId_userId;
        const found = members.find((item) => item.conversationId === key.conversationId && item.userId === key.userId);
        return found ? memberView(found) : null;
      },
      updateMany: async ({ where, data }: { where: any; data: Pick<Member, "lastReadMessageId" | "lastReadAt"> }) => {
        const found = members.find((item) => item.id === where.id);
        if (!found || !cursorPredicateMatches(found, where.OR)) return { count: 0 };
        Object.assign(found, data, { updatedAt: data.lastReadAt });
        return { count: 1 };
      }
    },
    roommateMessage: {
      findMany: async ({ where, orderBy, take }: { where: any; orderBy: unknown; take: number }) =>
        messages
          .filter((message) => message.conversationId === where.conversationId)
          .filter((message) => tuplePredicateMatches(message, where.OR))
          .sort(compareMessagesNewestFirst)
          .slice(0, take),
      findUnique: async ({ where }: { where: any }) => {
        if (where.id) return messages.find((message) => message.id === where.id) ?? null;
        const key = where.senderId_clientMessageId;
        return messages.find((message) => message.senderId === key.senderId && message.clientMessageId === key.clientMessageId) ?? null;
      },
      count: async ({ where }: { where: any }) =>
        messages.filter(
          (message) =>
            message.conversationId === where.conversationId &&
            message.senderId !== where.senderId.not &&
            tuplePredicateMatches(message, where.OR)
        ).length
    }
  };

  return {
    prisma,
    match,
    messages,
    get transactionCommitted() {
      return transactionCommitted;
    },
    addMessage(input: Partial<Message> & Pick<Message, "id" | "senderId" | "body" | "createdAt">) {
      messages.push({
        conversationId: conversation.id,
        clientMessageId: `client-${input.id}`,
        ...input
      });
      conversation.lastMessageAt = input.createdAt;
      conversation.updatedAt = input.createdAt;
    },
    setReadCursor(userId: string, messageId: string) {
      const message = messages.find((item) => item.id === messageId)!;
      Object.assign(members.find((item) => item.userId === userId)!, {
        lastReadMessageId: message.id,
        lastReadAt: message.createdAt
      });
    },
    memberFor(userId: string) {
      return members.find((item) => item.userId === userId)!;
    }
  };
}

function tuplePredicateMatches(message: Message, predicates?: Array<any>) {
  if (!predicates) return true;
  return predicates.some((predicate) => {
    if (predicate.createdAt?.lt) return message.createdAt < predicate.createdAt.lt;
    if (predicate.createdAt instanceof Date && predicate.id?.lt) {
      return message.createdAt.getTime() === predicate.createdAt.getTime() && message.id < predicate.id.lt;
    }
    if (predicate.createdAt?.gt) return message.createdAt > predicate.createdAt.gt;
    if (predicate.createdAt instanceof Date && predicate.id?.gt) {
      return message.createdAt.getTime() === predicate.createdAt.getTime() && message.id > predicate.id.gt;
    }
    return false;
  });
}

function cursorPredicateMatches(member: Member, predicates?: Array<any>) {
  if (!predicates) return true;
  return predicates.some((predicate) => {
    if (predicate.lastReadAt === null) return member.lastReadAt === null;
    if (predicate.lastReadAt?.lt) return member.lastReadAt !== null && member.lastReadAt < predicate.lastReadAt.lt;
    if (predicate.lastReadAt instanceof Date && predicate.lastReadMessageId?.lt) {
      return (
        member.lastReadAt?.getTime() === predicate.lastReadAt.getTime() &&
        (member.lastReadMessageId === null || member.lastReadMessageId < predicate.lastReadMessageId.lt)
      );
    }
    return false;
  });
}

function compareMessagesNewestFirst(left: Message, right: Message) {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}

function member(id: string, userId: string): Member {
  return {
    id,
    conversationId: "conversation-a-b",
    userId,
    lastReadMessageId: null,
    lastReadAt: null,
    createdAt: at(0),
    updatedAt: at(0)
  };
}

function user(id: string, name: string, image: string) {
  return {
    id,
    roommateProfile: {
      id: `profile-${id}`,
      name,
      age: 24,
      role: "Student",
      image,
      match: 90,
      budget: "$1,500",
      commute: "20 min",
      tags: ["quiet"]
    }
  };
}
