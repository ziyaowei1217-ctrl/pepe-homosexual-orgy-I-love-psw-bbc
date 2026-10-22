import { describe, expect, it } from "vitest";

import { RoommatesService } from "../src/roommates/roommates.service";

describe("RoommatesService", () => {
  it("returns an empty list when the candidate table is empty", async () => {
    const prisma = createPrismaMock([]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("omits the server-owned reciprocal flag from public candidates", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: true })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    const [result] = await service.findAll();

    expect(result).toMatchObject({ id: "roommate-1", name: "Mia Chen" });
    expect(result).not.toHaveProperty("localReciprocalLike");
  });

  it("excludes ownerless development candidates from production discovery", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const prisma = createPrismaMock([candidate({ id: "real-profile", ownerId: "user-2" }), candidate({ id: "demo-profile" })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    try {
      await expect(service.findAll()).resolves.toEqual([expect.objectContaining({ id: "real-profile" })]);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  it("does not leak server-owned fields from owned profiles in the deck", async () => {
    const prisma = createPrismaMock([candidate({ ownerId: "user-2", localReciprocalLike: true })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    const deck = await service.findDeck(1);

    expect(deck.items).toHaveLength(1);
    expect(deck.items[0]).not.toHaveProperty("ownerId");
    expect(deck.items[0]).not.toHaveProperty("localReciprocalLike");
  });

  it("excludes liked and recently passed cards, resurfaces older passes and puts LATER last", async () => {
    const now = new Date("2026-12-01T00:00:00.000Z");
    const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const cards = ["liked", "passed-recently", "passed-long-ago", "later", "fresh"].map((id) => candidate({ id, ownerId: `owner-${id}`, createdAt: now }));
    const actions = [
      { roommateProfileId: "liked", action: "LIKE", updatedAt: daysAgo(40) },
      { roommateProfileId: "passed-recently", action: "PASS", updatedAt: daysAgo(20) },
      { roommateProfileId: "passed-long-ago", action: "PASS", updatedAt: daysAgo(21) },
      { roommateProfileId: "later", action: "LATER", updatedAt: now }
    ];
    const prisma = {
      roommateProfile: { findMany: async () => cards, findUnique: async () => null },
      roommateAction: {
        findMany: async ({ where }: { where: { userId?: string; action?: unknown } }) => (where.userId && !where.action ? actions : []),
        groupBy: async () => []
      }
    };
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    const deck = await service.findDeck(20, "user-1", now);

    expect(deck.items.map((item) => [item.id, item.later])).toEqual([["fresh", false], ["passed-long-ago", false], ["later", true]]);
    expect(deck.total).toBe(3);
  });

  it("likes the actor back from a development demo card so the real match path runs", async () => {
    const demo = candidate({ id: "demo", ownerId: "demo-owner", localReciprocalLike: true });
    const upserts: unknown[] = [];
    const prisma = {
      roommateProfile: {
        findUnique: async ({ where }: { where: { id?: string; ownerId?: string } }) =>
          where.id === "demo" ? demo : where.ownerId === "user-1" ? { id: "card-1" } : null
      },
      roommateAction: { upsert: async (args: unknown) => upserts.push(args) }
    };
    const matches = {
      recordAction: async () => ({
        action: { action: "LIKE" },
        match: { id: "match-1", status: "ACTIVE", firstUserId: "demo-owner", secondUserId: "user-1" },
        conversation: { id: "conversation-1", matchId: "match-1", lastMessageAt: null }
      })
    };
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, matches as never);

    await expect(service.recordAction("user-1", "demo", "LIKE")).resolves.toEqual({
      action: { action: "LIKE" },
      match: { id: "match-1", status: "ACTIVE" },
      conversation: { id: "conversation-1", matchId: "match-1" },
      dealRoom: null
    });
    expect(upserts).toEqual([
      {
        where: { userId_roommateProfileId: { userId: "demo-owner", roommateProfileId: "card-1" } },
        create: { userId: "demo-owner", roommateProfileId: "card-1", action: "LIKE" },
        update: { action: "LIKE" }
      }
    ]);

    await service.recordAction("user-1", "demo", "PASS");
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      await service.recordAction("user-1", "demo", "LIKE");
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
    expect(upserts).toHaveLength(1);
  });

  it("records a pending like without creating a deal room", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: false })]);
    const dealRooms = createDealRoomsMock();
    const service = new RoommatesService(prisma as never, dealRooms as never, createRoommateMatchesMock() as never);

    const result = await service.recordAction("user-1", "roommate-1", "LIKE");

    expect(result.dealRoom).toBeNull();
    expect(dealRooms.inputs).toEqual([
      {
        userId: "user-1",
        roommateProfileId: "roommate-1",
        action: "LIKE",
        createDealRoom: false
      }
    ]);
  });

  it("does not create a deal room before reciprocal users confirm a team", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: true })]);
    const dealRooms = createDealRoomsMock();
    const service = new RoommatesService(prisma as never, dealRooms as never, createRoommateMatchesMock() as never);

    const result = await service.recordAction("user-1", "roommate-1", "LIKE");

    expect(result.dealRoom).toBeNull();
    expect(dealRooms.inputs[0]?.createDealRoom).toBe(false);
  });

  it("returns real inbound, outbound, and mutual likes for the signed-in user", async () => {
    const ownProfile = candidate({ id: "profile-self", ownerId: "user-1", name: "Me" });
    const peerProfile = candidate({ id: "profile-peer", ownerId: "user-2", name: "Peer" });
    const prisma = {
      roommateProfile: { findUnique: async () => ownProfile },
      roommateAction: {
        findMany: async ({ where }: { where: { userId?: string; roommateProfileId?: string } }) =>
          where.userId
            ? [{ action: "LIKE", roommateProfile: peerProfile }]
            : [{ action: "LIKE", user: { roommateProfile: peerProfile } }]
      }
    };
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    await expect(service.findActivity("user-1")).resolves.toMatchObject({
      inbound: [{ profile: { id: "profile-peer" } }],
      outbound: [{ profile: { id: "profile-peer" } }],
      matchedProfileIds: ["profile-peer"]
    });
  });
});

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "roommate-1",
    name: "Mia Chen",
    age: 22,
    role: "Student",
    image: "https://example.com/mia.jpg",
    match: 94,
    budget: "$1,450/month",
    commute: "Fenway",
    tags: ["quiet"],
    localReciprocalLike: false,
    ownerId: null as string | null,
    createdAt: new Date(),
    ...overrides
  };
}

function createPrismaMock(candidates: ReturnType<typeof candidate>[]) {
  return {
    roommateProfile: {
      findMany: async ({ where }: { where?: { ownerId?: { not: null } } } = {}) =>
        where?.ownerId ? candidates.filter((item) => item.ownerId) : candidates,
      findUnique: async ({ where }: { where: { id: string } }) =>
        candidates.find((item) => item.id === where.id) ?? null
    },
    roommateAction: { groupBy: async () => [] }
  };
}

function createDealRoomsMock() {
  const mock = {
    inputs: [] as Array<Record<string, unknown>>,
    recordRoommateAction: async (input: Record<string, unknown>) => {
      mock.inputs.push(input);
      return {
        action: { action: input.action },
        dealRoom: input.createDealRoom ? { id: "deal-room-1", status: "ACTIVE" } : null
      };
    }
  };
  return mock;
}

function createRoommateMatchesMock() {
  return {
    recordAction: async (userId: string, roommateProfileId: string, action: string) => ({
      action: { userId, roommateProfileId, action },
      match: null,
      conversation: null
    })
  };
}
