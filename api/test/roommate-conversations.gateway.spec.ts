import "reflect-metadata";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";

import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { RoommateConversationGateway } from "../src/roommate-conversations/roommate-conversations.gateway";
import { RoommateConversationsService } from "../src/roommate-conversations/roommate-conversations.service";

describe("RoommateConversationGateway", () => {
  it("rejects a socket without a valid JWT", async () => {
    const gateway = new RoommateConversationGateway(
      new AuthenticatedUserService(new JwtService({ secret: "test-secret" }), userStore([]) as never)
    );
    const client = socket({ token: "invalid-token" });

    await gateway.handleConnection(client as never);

    expect(client.joinedRooms).toEqual([]);
    expect(client.disconnected).toBe(true);
  });

  it("joins only the authenticated user room", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const gateway = new RoommateConversationGateway(
      new AuthenticatedUserService(jwt, userStore([{ id: "user-a", email: "a@example.test", role: "USER" }]) as never)
    );
    const client = socket({ token: await jwt.signAsync({ sub: "user-a" }) });

    await gateway.handleConnection(client as never);

    expect(client.joinedRooms).toEqual(["user:user-a"]);
    expect(client.disconnected).toBe(false);
  });

  it("emits a committed message to both participant user rooms", async () => {
    const gateway = new RoommateConversationGateway({} as AuthenticatedUserService);
    const emitted: Array<{ room: string; name: string; payload: unknown }> = [];
    gateway.server = namespace(emitted) as never;

    await gateway.publish({
      name: "roommate.message.created",
      deliveries: [
        { userId: "user-a", payload: { message: { id: "message-1", senderRole: "self" } } },
        { userId: "user-b", payload: { message: { id: "message-1", senderRole: "peer" } } }
      ]
    });

    expect(emitted).toEqual([
      {
        room: "user:user-a",
        name: "roommate.message.created",
        payload: { message: { id: "message-1", senderRole: "self" } }
      },
      {
        room: "user:user-b",
        name: "roommate.message.created",
        payload: { message: { id: "message-1", senderRole: "peer" } }
      }
    ]);
    expect(JSON.stringify(emitted.map(({ payload }) => payload))).not.toContain("deliveries");
    expect(JSON.stringify(emitted.map(({ payload }) => payload))).not.toContain("user-a");
    expect(JSON.stringify(emitted.map(({ payload }) => payload))).not.toContain("user-b");
  });

  it("never accepts a client-supplied target room", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const gateway = new RoommateConversationGateway(
      new AuthenticatedUserService(jwt, userStore([{ id: "user-a", email: "a@example.test", role: "USER" }]) as never)
    );
    const client = socket({
      token: await jwt.signAsync({ sub: "user-a" }),
      room: "user:victim"
    });

    await gateway.handleConnection(client as never);

    expect(client.joinedRooms).toEqual(["user:user-a"]);
  });

  it("keeps HTTP send successful when socket publication throws", async () => {
    const createdAt = new Date("2026-08-09T12:00:00.000Z");
    const membership = {
      id: "member-a",
      conversationId: "conversation-a-b",
      userId: "user-a",
      lastReadMessageId: null,
      lastReadAt: null,
      conversation: {
        id: "conversation-a-b",
        matchId: "match-a-b",
        lastMessageAt: null,
        createdAt,
        updatedAt: createdAt,
        match: { id: "match-a-b", status: "ACTIVE" },
        members: [
          { userId: "user-a", lastReadMessageId: null, lastReadAt: null, user: { id: "user-a", roommateProfile: null } },
          { userId: "user-b", lastReadMessageId: null, lastReadAt: null, user: { id: "user-b", roommateProfile: null } }
        ]
      }
    };
    const message = {
      id: "message-1",
      conversationId: "conversation-a-b",
      senderId: "user-a",
      clientMessageId: "93f7e722-0ef0-4c77-b21b-5afef366d54b",
      body: "Committed message",
      createdAt
    };
    let committed = false;
    const prisma = {
      roommateConversationMember: { findUnique: vi.fn().mockResolvedValue(membership) },
      roommateMessage: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
        const result = await callback({
          $queryRaw: async () => [{ status: "ACTIVE" }],
          roommateMessage: { create: async () => message },
          roommateConversation: { update: async () => ({}) }
        });
        committed = true;
        return result;
      }
    };
    const service = new RoommateConversationsService(
      prisma as never,
      { publish: async () => { throw new Error("socket unavailable"); } },
      { consume: async () => undefined }
    );

    await expect(
      service.sendMessage("user-a", "conversation-a-b", {
        clientMessageId: message.clientMessageId,
        body: message.body
      })
    ).resolves.toMatchObject({ id: "message-1", body: "Committed message" });
    expect(committed).toBe(true);
  });
});

function userStore(users: Array<{ id: string; email: string; role: string }>) {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null
    }
  };
}

function socket(auth: Record<string, unknown>) {
  return {
    handshake: { auth },
    joinedRooms: [] as string[],
    disconnected: false,
    async join(room: string) {
      this.joinedRooms.push(room);
    },
    disconnect() {
      this.disconnected = true;
    }
  };
}

function namespace(emitted: Array<{ room: string; name: string; payload: unknown }>) {
  return {
    to(room: string) {
      return {
        emit(name: string, payload: unknown) {
          emitted.push({ room, name, payload });
        }
      };
    }
  };
}
