import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoommateMatchService, normalizeUserPair } from "../src/roommates/roommate-match.service";
import { RoommatesService } from "../src/roommates/roommates.service";

describe("RoommateMatchService", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("creates one match and two members after the second reciprocal LIKE", async () => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    await service.recordAction("user-a", "profile-b", "LIKE");
    const result = await service.recordAction("user-b", "profile-a", "LIKE");

    expect(result.action).toMatchObject({ userId: "user-b", roommateProfileId: "profile-a", action: "LIKE" });
    expect(result.match).toMatchObject({ firstUserId: "user-a", secondUserId: "user-b" });
    expect(result.conversation).toMatchObject({ matchId: result.match?.id });
    expect(database.matches).toHaveLength(1);
    expect(database.conversationMembers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conversationId: result.conversation?.id, userId: "user-a" }),
        expect.objectContaining({ conversationId: result.conversation?.id, userId: "user-b" })
      ])
    );
  });

  it("returns the existing conversation when the reciprocal LIKE is retried", async () => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    await service.recordAction("user-a", "profile-b", "LIKE");
    const first = await service.recordAction("user-b", "profile-a", "LIKE");
    const retried = await service.recordAction("user-b", "profile-a", "LIKE");

    expect(retried.match?.id).toBe(first.match?.id);
    expect(retried.conversation?.id).toBe(first.conversation?.id);
    expect(database.matches).toHaveLength(1);
    expect(database.conversations).toHaveLength(1);
    expect(database.conversationMembers).toHaveLength(2);
  });

  it("does not create a conversation for one-sided LIKE, PASS, or LATER", async () => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    const oneSidedLike = await service.recordAction("user-a", "profile-b", "LIKE");
    const pass = await service.recordAction("user-b", "profile-a", "PASS");
    const later = await service.recordAction("user-a", "profile-b", "LATER");

    expect(oneSidedLike).toMatchObject({ match: null, conversation: null });
    expect(pass).toMatchObject({ match: null, conversation: null });
    expect(later).toMatchObject({ match: null, conversation: null });
    expect(database.conversations).toHaveLength(0);
  });

  it("rejects actions against the actor's own owned profile", async () => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    await expect(service.recordAction("user-a", "profile-a", "LIKE")).rejects.toBeInstanceOf(BadRequestException);
    expect(database.actions).toHaveLength(0);
  });

  it("never creates real chat for an ownerless development candidate", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    const result = await service.recordAction("user-a", "demo-profile", "LIKE");

    expect(result).toMatchObject({ match: null, conversation: null });
    expect(database.actions).toHaveLength(1);
    expect(database.conversations).toHaveLength(0);
  });

  it.each(["LIKE", "PASS", "LATER"] as const)("rejects production ownerless targets before %s persistence or private-name feedback", async action => {
    vi.stubEnv("NODE_ENV", "production");
    const database = createDatabase();
    const matches = new RoommateMatchService(database.prisma as never);
    const legacyAction = vi.fn();
    const routePrisma = {
      roommateProfile: { findUnique: async ({ where }: { where: { id: string } }) =>
        database.profiles.find(profile => profile.id === where.id) ?? null }
    };
    const service = new RoommatesService(routePrisma as never, { recordRoommateAction: legacyAction } as never, matches);
    const rejection = await service.recordAction("user-a", "demo-profile", action).catch(error => error);
    expect(rejection).toBeInstanceOf(NotFoundException);
    expect(rejection.getResponse()).toEqual(new NotFoundException("Roommate profile not found").getResponse());
    expect(database.actions).toHaveLength(0);
    expect(database.matches).toHaveLength(0);
    expect(database.conversations).toHaveLength(0);
    expect(legacyAction).not.toHaveBeenCalled();
  });

  it("retains production matching for eligible owned targets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const database = createDatabase();
    const matches = new RoommateMatchService(database.prisma as never);
    await matches.recordAction("user-a", "profile-b", "LIKE");
    expect(await matches.recordAction("user-b", "profile-a", "LIKE"))
      .toMatchObject({ match: { firstUserId: "user-a", secondUserId: "user-b" }, conversation: expect.any(Object) });
  });

  it("normalizes pair order during concurrent opposite-direction likes", async () => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);

    await Promise.all([
      service.recordAction("user-b", "profile-a", "LIKE"),
      service.recordAction("user-a", "profile-b", "LIKE")
    ]);

    expect(normalizeUserPair("user-b", "user-a")).toEqual({ firstUserId: "user-a", secondUserId: "user-b" });
    expect(database.matches).toEqual([expect.objectContaining({ firstUserId: "user-a", secondUserId: "user-b" })]);
    expect(database.conversations).toHaveLength(1);
    expect(database.conversationMembers).toHaveLength(2);
  });

  it("retries a serializable transaction conflict before recording the action", async () => {
    const database = createDatabase({ transactionFailures: [transactionConflict()] });
    const service = new RoommateMatchService(database.prisma as never);

    const result = await service.recordAction("user-a", "profile-b", "LIKE");

    expect(result.action).toMatchObject({ userId: "user-a", roommateProfileId: "profile-b", action: "LIKE" });
    expect(database.transactionAttempts).toBe(2);
  });

  it("does not retry a non-transaction error", async () => {
    const database = createDatabase({ transactionFailures: [new Error("database unavailable")] });
    const service = new RoommateMatchService(database.prisma as never);

    await expect(service.recordAction("user-a", "profile-b", "LIKE")).rejects.toThrow("database unavailable");
    expect(database.transactionAttempts).toBe(1);
  });

  it.each(["40001", "40P01"])("retries a PostgreSQL row-lock transaction conflict surfaced as P2010/%s", async code => {
    const database = createDatabase({ transactionFailures: [new Prisma.PrismaClientKnownRequestError("Row lock conflict", {
      code: "P2010", clientVersion: "test", meta: { code }
    })] });
    expect(await new RoommateMatchService(database.prisma as never).recordAction("user-a", "profile-b", "LIKE"))
      .toMatchObject({ action: { action: "LIKE" } });
    expect(database.transactionAttempts).toBe(2);
  });

  it("does not retry unrelated raw query failures", async () => {
    const failure = new Prisma.PrismaClientKnownRequestError("Invalid raw query", {
      code: "P2010", clientVersion: "test", meta: { code: "42601" }
    });
    const database = createDatabase({ transactionFailures: [failure] });
    await expect(new RoommateMatchService(database.prisma as never).recordAction("user-a", "profile-b", "LIKE"))
      .rejects.toBe(failure);
    expect(database.transactionAttempts).toBe(1);
  });

  it.each([
    { status: "hidden", archivedAt: null },
    { status: "matched", archivedAt: null },
    { status: "hidden", archivedAt: new Date() },
    { status: "matched", archivedAt: new Date() },
    { status: "active", archivedAt: new Date() }
  ])("rejects new actions against unavailable targets before persisting anything: %o", async (visibility) => {
    for (const action of ["LIKE", "PASS", "LATER"] as const) {
      const database = createDatabase();
      Object.assign(database.profiles[1], visibility);
      const service = new RoommateMatchService(database.prisma as never);
      await expect(service.recordAction("user-a", "profile-b", action)).rejects.toBeInstanceOf(NotFoundException);
      expect(database.actions).toHaveLength(0);
      expect(database.matches).toHaveLength(0);
      expect(database.conversations).toHaveLength(0);
      expect(database.conversationMembers).toHaveLength(0);
    }
  });

  it.each(["hidden", "matched"])("cannot publish inbound activity or a conversation when the actor is %s", async (status) => {
    const database = createDatabase();
    const service = new RoommateMatchService(database.prisma as never);
    await service.recordAction("user-b", "profile-a", "LIKE");
    Object.assign(database.profiles[0], { status, archivedAt: null });
    await expect(service.recordAction("user-a", "profile-b", "LIKE")).rejects.toBeInstanceOf(BadRequestException);
    expect(database.actions).toHaveLength(1);
    expect(database.actions[0].userId).toBe("user-b");
    expect(database.matches).toHaveLength(0);
    expect(database.conversations).toHaveLength(0);
  });

  it("rechecks visibility in the retried transaction after an archive wins a race", async () => {
    const database = createDatabase({ transactionFailures: [transactionConflict()] });
    Object.assign(database.profiles[1], { status: "hidden", archivedAt: new Date() });
    await expect(new RoommateMatchService(database.prisma as never)
      .recordAction("user-a", "profile-b", "LIKE")).rejects.toBeInstanceOf(NotFoundException);
    expect(database.transactionAttempts).toBe(2);
    expect(database.actions).toHaveLength(0);
    expect(database.matches).toHaveLength(0);
  });
});

type Action = { id: string; userId: string; roommateProfileId: string; action: "LIKE" | "PASS" | "LATER" };
type Match = { id: string; firstUserId: string; secondUserId: string; status: "ACTIVE" };
type Conversation = { id: string; matchId: string };
type ConversationMember = { conversationId: string; userId: string };

function createDatabase(options: { transactionFailures?: Error[] } = {}) {
  const profiles = [
    profile("profile-a", "user-a"),
    profile("profile-b", "user-b"),
    profile("demo-profile", null)
  ];
  const actions: Action[] = [];
  const matches: Match[] = [];
  const conversations: Conversation[] = [];
  const conversationMembers: ConversationMember[] = [];
  let transactionAttempts = 0;

  const prisma = {
    $transaction: async <T>(operation: (transaction: any) => Promise<T>) => {
      transactionAttempts += 1;
      const error = options.transactionFailures?.shift();
      if (error) throw error;
      return operation(transaction);
    }
  };
  const transaction = {
    $queryRaw: async () => profiles.map(({ id }) => ({ id })),
    roommateProfile: {
      findUnique: async ({ where }: { where: { id?: string; ownerId?: string } }) =>
        profiles.find((item) => item.id === where.id || item.ownerId === where.ownerId) ?? null
    },
    roommateAction: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { userId_roommateProfileId: { userId: string; roommateProfileId: string } };
        create: Omit<Action, "id">;
        update: Pick<Action, "action">;
      }) => {
        const existing = actions.find(
          (item) =>
            item.userId === where.userId_roommateProfileId.userId &&
            item.roommateProfileId === where.userId_roommateProfileId.roommateProfileId
        );
        if (existing) return Object.assign(existing, update);
        const action = { id: `action-${actions.length + 1}`, ...create };
        actions.push(action);
        return action;
      },
      findFirst: async ({ where }: { where: Partial<Pick<Action, "userId" | "roommateProfileId" | "action">> }) =>
        actions.find(
          (item) =>
            item.userId === where.userId &&
            item.roommateProfileId === where.roommateProfileId &&
            item.action === where.action
        ) ?? null
    },
    roommateMatch: {
      upsert: async ({
        where,
        create,
        update
      }: {
        where: { firstUserId_secondUserId: { firstUserId: string; secondUserId: string } };
        create: Omit<Match, "id">;
        update: Partial<Match>;
      }) => {
        const existing = matches.find(
          (item) =>
            item.firstUserId === where.firstUserId_secondUserId.firstUserId &&
            item.secondUserId === where.firstUserId_secondUserId.secondUserId
        );
        if (existing) return Object.assign(existing, update);
        const match = { id: `match-${matches.length + 1}`, ...create };
        matches.push(match);
        return match;
      }
    },
    roommateConversation: {
      upsert: async ({ where, create }: { where: { matchId: string }; create: Omit<Conversation, "id">; update: object }) => {
        const existing = conversations.find((item) => item.matchId === where.matchId);
        if (existing) return existing;
        const conversation = { id: `conversation-${conversations.length + 1}`, ...create };
        conversations.push(conversation);
        return conversation;
      }
    },
    roommateConversationMember: {
      createMany: async ({ data }: { data: ConversationMember[]; skipDuplicates: boolean }) => {
        for (const member of data) {
          if (!conversationMembers.some((item) => item.conversationId === member.conversationId && item.userId === member.userId)) {
            conversationMembers.push(member);
          }
        }
        return { count: data.length };
      }
    }
  };

  return {
    prisma,
    profiles,
    actions,
    matches,
    conversations,
    conversationMembers,
    get transactionAttempts() {
      return transactionAttempts;
    }
  };
}

function transactionConflict() {
  return new Prisma.PrismaClientKnownRequestError("Transaction conflict", {
    code: "P2034",
    clientVersion: "test"
  });
}

function profile(id: string, ownerId: string | null) {
  return {
    id,
    ownerId,
    status: "active",
    archivedAt: null as Date | null,
    name: id,
    age: 22,
    role: "Student",
    image: "https://example.test/profile.jpg",
    match: 90,
    budget: "$1,500",
    commute: "20 min",
    tags: ["quiet"]
  };
}
