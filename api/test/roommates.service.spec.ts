import { describe, expect, it } from "vitest";

import { RoommatesService } from "../src/roommates/roommates.service";

describe("RoommatesService", () => {
  it("returns an empty list when the candidate table is empty", async () => {
    const prisma = createPrismaMock([]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("omits the server-owned reciprocal flag from public candidates", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: true })]);
    const service = new RoommatesService(prisma as never, createDealRoomsMock() as never);

    const [result] = await service.findAll();

    expect(result).toMatchObject({ id: "roommate-1", name: "Mia Chen" });
    expect(result).not.toHaveProperty("localReciprocalLike");
  });

  it("records a pending like without creating a deal room", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: false })]);
    const dealRooms = createDealRoomsMock();
    const service = new RoommatesService(prisma as never, dealRooms as never);

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

  it("creates a deal room only for a reciprocal like", async () => {
    const prisma = createPrismaMock([candidate({ localReciprocalLike: true })]);
    const dealRooms = createDealRoomsMock();
    const service = new RoommatesService(prisma as never, dealRooms as never);

    const result = await service.recordAction("user-1", "roommate-1", "LIKE");

    expect(result.dealRoom).toEqual({ id: "deal-room-1", status: "ACTIVE" });
    expect(dealRooms.inputs[0]?.createDealRoom).toBe(true);
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
    createdAt: new Date(),
    ...overrides
  };
}

function createPrismaMock(candidates: ReturnType<typeof candidate>[]) {
  return {
    roommateProfile: {
      findMany: async () => candidates,
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
