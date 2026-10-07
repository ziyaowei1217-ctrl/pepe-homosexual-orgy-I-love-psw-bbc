import { describe, expect, it, vi } from "vitest";

import { buildRoommateDeck } from "../src/roommates/matching";
import { MAX_DISCOVERABLE_ROOMMATE_PROFILES, RoommatesService } from "../src/roommates/roommates.service";

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

  it("excludes archived cards even when historical status still says active", async () => {
    const prisma = createPrismaMock([candidate({ id: "visible" }), candidate({ id: "archived", archivedAt: new Date() }), candidate({ id: "hidden", status: "hidden" })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);
    await expect(service.findAll()).resolves.toEqual([expect.objectContaining({ id: "visible" })]);
  });

  it("does not leak server-owned fields from owned profiles in the deck", async () => {
    const prisma = createPrismaMock([candidate({ ownerId: "user-2", localReciprocalLike: true })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);

    const deck = await service.findDeck({ limit: 1 });

    expect(deck.items).toHaveLength(1);
    expect(deck.items[0]).not.toHaveProperty("ownerId");
    expect(deck.items[0]).not.toHaveProperty("localReciprocalLike");
  });

  it("returns the same full ranking metadata for candidates beyond the first deck page", async () => {
    const profiles = Array.from({ length: 240 }, (_, index) => candidate({ id: `profile-${index}`, ownerId: `user-${index}`, name: `Candidate ${index}` }));
    const expected = buildRoommateDeck(profiles, { cursor: 160, limit: 80 }).items.at(-1)!;
    const service = new RoommatesService(createPrismaMock(profiles) as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);
    await expect(service.findDeckCandidate(expected.id!)).resolves.toEqual(expected);
  });

  it("short circuits an absent candidate before reading any ranking inputs", async () => {
    let reads = 0;
    const profiles = Array.from({ length: 240 }, (_, index) => {
      const profile = candidate({ id: `profile-${index}`, ownerId: `user-${index}` });
      Object.defineProperty(profile, "budget", { enumerable: true, get() { reads += 1; return "$1,450/month"; } });
      return profile;
    });
    const service = new RoommatesService(createPrismaMock(profiles) as never, createDealRoomsMock() as never, createRoommateMatchesMock() as never);
    await expect(service.findDeckCandidate("absent-candidate")).rejects.toThrow("Roommate candidate not found");
    expect(reads).toBe(0);
  });

  it("preserves every profile and the original ranking across all below-cap pages", async () => {
    const profiles = Array.from({ length: 241 }, (_, i) => candidate({ id: `p-${i}`, ownerId: `u-${i}`, name: `Candidate ${i}`, match: 70 + i % 30 }));
    const prisma = createPrismaMock(profiles);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);
    const expected = buildRoommateDeck(profiles, { limit: 80 });
    const actual = [];
    for (let cursor = 0; cursor < profiles.length; cursor += 80) actual.push(...(await service.findDeck({ cursor, limit: 80 })).items);
    expect(actual).toEqual([...expected.items, ...buildRoommateDeck(profiles, { cursor: 80, limit: 80 }).items,
      ...buildRoommateDeck(profiles, { cursor: 160, limit: 80 }).items, ...buildRoommateDeck(profiles, { cursor: 240, limit: 80 }).items]);
    expect(new Set(actual.map(profile => profile.id)).size).toBe(profiles.length);
    expect(prisma.roommateProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5_001 }));
  });

  it("accepts exactly the supported capacity without dropping the final page", async () => {
    const profiles = Array.from({ length: MAX_DISCOVERABLE_ROOMMATE_PROFILES }, (_, i) => candidate({ id: `p-${i}`, ownerId: `u-${i}` }));
    const prisma = createPrismaMock(profiles); const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);
    const result = await service.findDeck({ cursor: 4_960, limit: 80 });
    expect(result.items).toHaveLength(40); expect(result.pageInfo.totalCandidates).toBe(5_000); expect(result.pageInfo.nextCursor).toBeNull();
  });

  it("rejects a previously acted-on detail without scanning the catalog", async () => {
    const prisma = createPrismaMock([candidate({ ownerId: "peer" })]);
    prisma.roommateAction.findUnique.mockResolvedValueOnce({ id: "action" } as never);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);
    await expect(service.findDeckCandidate("roommate-1", "self")).rejects.toMatchObject({ status: 404 });
    expect(prisma.roommateProfile.findMany).not.toHaveBeenCalled();
  });

  it("rejects overflow before scoring and bounds the database working set", async () => {
    let rankingReads = 0;
    const profiles = Array.from({ length: MAX_DISCOVERABLE_ROOMMATE_PROFILES + 20 }, (_, i) => {
      const profile = candidate({ id: `p-${i}`, ownerId: `u-${i}` });
      Object.defineProperty(profile, "budget", { get() { rankingReads += 1; throw new Error("must not rank"); } });
      return profile;
    });
    const prisma = createPrismaMock(profiles);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);
    await expect(service.findDeck({ limit: 1 })).rejects.toMatchObject({ status: 503, response: { code: "DISCOVERY_CAPACITY_EXCEEDED" } });
    expect(rankingReads).toBe(0);
    expect(prisma.roommateProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5_001 }));
    await expect(service.findDeckCandidate("absent")).rejects.toMatchObject({ status: 404 });
    expect(prisma.roommateProfile.findMany).toHaveBeenCalledTimes(1);
  });

  it.each([{ status: "hidden" }, { archivedAt: new Date() }, { ownerId: "self" }])("short circuits an ineligible detail request %j", async fields => {
    const prisma = createPrismaMock([candidate({ ownerId: "peer", ...fields })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);
    await expect(service.findDeckCandidate("roommate-1", "self")).rejects.toMatchObject({ status: 404 });
    expect(prisma.roommateProfile.findMany).not.toHaveBeenCalled();
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
    status: "active",
    archivedAt: null as Date | null,
    createdAt: new Date(),
    ...overrides
  };
}

function createPrismaMock(candidates: ReturnType<typeof candidate>[]) {
  return {
    roommateProfile: {
      findMany: vi.fn(async ({ where, take }: { where?: { ownerId?: { not: null }; status?: string; archivedAt?: null }; take?: number } = {}) =>
        candidates.filter(item => (!where?.ownerId || item.ownerId) && (!where?.status || item.status === where.status) && (where?.archivedAt !== null || item.archivedAt === null)).slice(0, take)),
      findUnique: async ({ where }: { where: { id: string } }) =>
        candidates.find((item) => item.id === where.id) ?? null
    },
    roommateAction: { findUnique: vi.fn(async () => null), findMany: vi.fn(async () => []) }
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
