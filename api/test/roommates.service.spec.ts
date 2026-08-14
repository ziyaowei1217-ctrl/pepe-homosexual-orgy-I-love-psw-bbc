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

    const deck = await service.findDeck({ limit: 1 });

    expect(deck.items).toHaveLength(1);
    expect(deck.items[0]).not.toHaveProperty("ownerId");
    expect(deck.items[0]).not.toHaveProperty("localReciprocalLike");
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
    }
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
