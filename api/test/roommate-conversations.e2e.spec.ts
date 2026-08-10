import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthGuard } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { ROOMMATE_CONVERSATION_EVENTS } from "../src/roommate-conversations/roommate-conversation-events";
import { RoommateConversationsController } from "../src/roommate-conversations/roommate-conversations.controller";
import { RoommateConversationsService } from "../src/roommate-conversations/roommate-conversations.service";
import {
  LocalRoommateMessageRateLimiter,
  RoommateMessageRateLimiter
} from "../src/roommate-conversations/roommate-message-rate-limit";

const request = require("supertest") as (server: unknown) => any;

describe("roommate conversation HTTP API", () => {
  let app: INestApplication;
  let database: ReturnType<typeof createHttpDatabase>;
  let tokens: Record<string, string>;

  beforeEach(async () => {
    database = createHttpDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "roommate-http-secret" })],
      controllers: [RoommateConversationsController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        RoommateConversationsService,
        { provide: PrismaService, useValue: database.prisma },
        { provide: ROOMMATE_CONVERSATION_EVENTS, useValue: { publish: async () => undefined } },
        { provide: RoommateMessageRateLimiter, useValue: new LocalRoommateMessageRateLimiter() }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const jwt = app.get(JwtService);
    tokens = Object.fromEntries(
      await Promise.all(database.users.map(async (user) => [user.id, await jwt.signAsync({ sub: user.id })]))
    );
  });

  afterEach(async () => app.close());

  it("lets both members list, send, read, and recover an offline unread message", async () => {
    const http = request(app.getHttpServer());

    const initial = await http.get("/api/v1/roommate-conversations").auth(tokens["user-a"], { type: "bearer" }).expect(200);
    expect(initial.body).toEqual([
      expect.objectContaining({ id: "conversation-a-b", peer: expect.objectContaining({ id: "profile-b" }), unreadCount: 0 })
    ]);

    const command = {
      clientMessageId: "aed8383c-9bf0-4412-850c-5d62a3734ed1",
      body: "  Are you still looking?  "
    };
    const sent = await http
      .post("/api/v1/roommate-conversations/conversation-a-b/messages")
      .auth(tokens["user-a"], { type: "bearer" })
      .send(command)
      .expect(201);
    const retried = await http
      .post("/api/v1/roommate-conversations/conversation-a-b/messages")
      .auth(tokens["user-a"], { type: "bearer" })
      .send(command)
      .expect(201);
    expect(retried.body).toMatchObject({ id: sent.body.id, body: "Are you still looking?" });
    expect(database.messages).toHaveLength(1);

    const recipientInbox = await http
      .get("/api/v1/roommate-conversations")
      .auth(tokens["user-b"], { type: "bearer" })
      .expect(200);
    expect(recipientInbox.body[0]).toMatchObject({ peer: { id: "profile-a" }, unreadCount: 1 });

    const offlineHistory = await http
      .get("/api/v1/roommate-conversations/conversation-a-b/messages")
      .auth(tokens["user-b"], { type: "bearer" })
      .expect(200);
    expect(offlineHistory.body.messages).toEqual([expect.objectContaining({ id: sent.body.id, body: "Are you still looking?" })]);

    const read = await http
      .post("/api/v1/roommate-conversations/conversation-a-b/read")
      .auth(tokens["user-b"], { type: "bearer" })
      .send({ lastReadMessageId: sent.body.id })
      .expect(201);
    expect(read.body).toMatchObject({ self: { lastReadMessageId: sent.body.id } });
    for (const body of [initial.body, sent.body, recipientInbox.body, offlineHistory.body, read.body]) {
      expect(JSON.stringify(body)).not.toContain("user-a");
      expect(JSON.stringify(body)).not.toContain("user-b");
    }
  });

  it("makes inaccessible and missing conversations indistinguishable", async () => {
    const http = request(app.getHttpServer());
    const inaccessible = await http
      .get("/api/v1/roommate-conversations/conversation-a-b/messages")
      .auth(tokens["user-c"], { type: "bearer" })
      .expect(404);
    const missing = await http
      .get("/api/v1/roommate-conversations/missing/messages")
      .auth(tokens["user-c"], { type: "bearer" })
      .expect(404);

    expect(inaccessible.body).toEqual(missing.body);
    expect(missing.body).toMatchObject({ statusCode: 404, message: "Roommate conversation not found" });
  });

  it("uses the existing guard and validates message and cursor inputs", async () => {
    const http = request(app.getHttpServer());
    await http.get("/api/v1/roommate-conversations").expect(401);
    await http
      .post("/api/v1/roommate-conversations/conversation-a-b/messages")
      .auth(tokens["user-a"], { type: "bearer" })
      .send({ clientMessageId: "aed8383c-9bf0-4412-850c-5d62a3734ed1", body: "   " })
      .expect(400);
    await http
      .get("/api/v1/roommate-conversations/conversation-a-b/messages?cursor=malformed")
      .auth(tokens["user-a"], { type: "bearer" })
      .expect(400);
    await http
      .get("/api/v1/roommate-conversations/conversation-a-b/messages?cursor=")
      .auth(tokens["user-a"], { type: "bearer" })
      .expect(400);
  });
});

type HttpMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: Date;
};

function createHttpDatabase() {
  const users = [httpUser("user-a", "User A"), httpUser("user-b", "User B"), httpUser("user-c", "User C")];
  const match = { id: "match-a-b", status: "ACTIVE" as const };
  const conversation = {
    id: "conversation-a-b",
    matchId: match.id,
    lastMessageAt: null as Date | null,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
    updatedAt: new Date("2026-08-09T00:00:00.000Z")
  };
  const members = [httpMember("member-a", "user-a"), httpMember("member-b", "user-b")];
  const messages: HttpMessage[] = [];
  let sequence = 0;

  function memberView(record: ReturnType<typeof httpMember>) {
    return {
      ...record,
      conversation: {
        ...conversation,
        match,
        members: members.map((member) => ({ ...member, user: users.find((user) => user.id === member.userId) })),
        messages: [...messages].sort(newestFirst).slice(0, 1)
      }
    };
  }

  const transaction = {
    $queryRaw: async () => [{ status: match.status }],
    roommateMessage: {
      create: async ({ data }: { data: Omit<HttpMessage, "id" | "createdAt"> }) => {
        const message = {
          id: `http-message-${++sequence}`,
          createdAt: new Date(`2026-08-09T00:00:${sequence.toString().padStart(2, "0")}.000Z`),
          ...data
        };
        messages.push(message);
        return message;
      }
    },
    roommateConversation: {
      update: async ({ data }: { data: { lastMessageAt: Date } }) => {
        conversation.lastMessageAt = data.lastMessageAt;
        conversation.updatedAt = data.lastMessageAt;
        return conversation;
      }
    }
  };

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null
    },
    $transaction: async <T>(operation: (client: typeof transaction) => Promise<T>) => operation(transaction),
    roommateConversationMember: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        members.filter((member) => member.userId === where.userId).map(memberView),
      findUnique: async ({ where }: { where: { conversationId_userId: { conversationId: string; userId: string } } }) => {
        const key = where.conversationId_userId;
        const member = members.find((candidate) => candidate.conversationId === key.conversationId && candidate.userId === key.userId);
        return member ? memberView(member) : null;
      },
      updateMany: async ({ where, data }: { where: { id: string }; data: { lastReadMessageId: string; lastReadAt: Date } }) => {
        const member = members.find((candidate) => candidate.id === where.id)!;
        if (member.lastReadAt && member.lastReadAt >= data.lastReadAt) return { count: 0 };
        Object.assign(member, data);
        return { count: 1 };
      }
    },
    roommateMessage: {
      findUnique: async ({ where }: { where: any }) => {
        if (where.id) return messages.find((message) => message.id === where.id) ?? null;
        const key = where.senderId_clientMessageId;
        return messages.find((message) => message.senderId === key.senderId && message.clientMessageId === key.clientMessageId) ?? null;
      },
      findMany: async ({ where, take }: { where: any; take: number }) =>
        messages.filter((message) => message.conversationId === where.conversationId).sort(newestFirst).slice(0, take),
      count: async ({ where }: { where: any }) =>
        messages.filter(
          (message) =>
            message.conversationId === where.conversationId &&
            message.senderId !== where.senderId.not &&
            (!where.OR || message.createdAt > where.OR[0].createdAt.gt)
        ).length
    }
  };

  return { prisma, users, messages };
}

function httpUser(id: string, name: string) {
  return {
    id,
    email: `${id}@example.test`,
    role: "USER",
    roommateProfile: {
      id: id === "user-a" ? "profile-a" : id === "user-b" ? "profile-b" : "profile-c",
      name,
      age: 24,
      role: "Student",
      image: id === "user-a" ? "https://example.test/a.jpg" : id === "user-b" ? "https://example.test/b.jpg" : "https://example.test/c.jpg",
      match: 90,
      budget: "$1,500",
      commute: "20 min",
      tags: ["quiet"]
    }
  };
}

function httpMember(id: string, userId: string) {
  return {
    id,
    conversationId: "conversation-a-b",
    userId,
    lastReadMessageId: null as string | null,
    lastReadAt: null as Date | null,
    createdAt: new Date("2026-08-09T00:00:00.000Z"),
    updatedAt: new Date("2026-08-09T00:00:00.000Z")
  };
}

function newestFirst(left: HttpMessage, right: HttpMessage) {
  return right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id);
}
