import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";

describe("DealRoomsService", () => {
  it("likes a roommate and creates an active deal room", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const result = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });

    expect(result.action.action).toBe("LIKE");
    expect(result.dealRoom?.status).toBe("ACTIVE");
    expect(result.dealRoom?.canRequestTour).toBe(true);
    expect(prisma.roommateAction.upsertCalls[0].where.userId_roommateProfileId).toEqual({
      userId: "user-1",
      roommateProfileId: "roommate-1"
    });
    expect(prisma.dealRoom.createCalls).toHaveLength(1);
    expect(prisma.dealRoomMember.upsertCalls).toHaveLength(1);
  });

  it("returns the existing deal room when liking the same roommate twice", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const first = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });
    const second = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });

    expect(first.dealRoom?.id).toBe(second.dealRoom?.id);
    expect(prisma.dealRoom.createCalls).toHaveLength(1);
  });

  it("does not create a deal room for pass or later actions", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const passed = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "PASS"
    });
    const later = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LATER"
    });

    expect(passed.dealRoom).toBeNull();
    expect(later.dealRoom).toBeNull();
    expect(prisma.dealRoom.createCalls).toHaveLength(0);
  });

  it("recommends only approved database listings when creating a deal room", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({ id: "draft-listing", status: "DRAFT", score: 5 }),
        listingRecord({ id: "approved-listing", status: "APPROVED", score: 4.5 })
      ]
    });
    const service = new DealRoomsService(prisma as never);

    const result = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });

    expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
    expect(result.dealRoom?.recommendedHomes).toMatchObject([{ id: "approved-listing" }]);
    expect(JSON.stringify(result.dealRoom?.recommendedHomes)).not.toContain("draft-listing");
  });

  it("keeps seed fallback when no approved database listings exist", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft-listing", status: "DRAFT" })]
    });
    const service = new DealRoomsService(prisma as never);

    const result = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });

    expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
    expect(result.dealRoom?.recommendedHomes).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^seed-/) })])
    );
  });

  it("creates a tour request for an owned deal room idempotently", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const match = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });
    const first = await service.requestGroupTour("user-1", match.dealRoom!.id);
    const second = await service.requestGroupTour("user-1", match.dealRoom!.id);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe("REQUESTED");
    expect(prisma.tourRequest.createCalls).toHaveLength(1);
  });

  it("rejects tour requests for deal rooms owned by another user", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const match = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE"
    });

    await expect(service.requestGroupTour("user-2", match.dealRoom!.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

type RoommateRecord = {
  id: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
  createdAt: Date;
};

type ListingRecord = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
  status: ListingStatus;
};

type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type DealRoomRecord = {
  id: string;
  ownerId: string;
  roommateProfileId: string;
  status: "ACTIVE" | "ARCHIVED";
  recommendedHomes: unknown;
  pipeline: unknown;
  trustChecklist: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function createPrismaMock({ listings = [listingRecord()] }: { listings?: ListingRecord[] } = {}) {
  const state = {
    actions: [] as Array<{ id: string; userId: string; roommateProfileId: string; action: string; createdAt: Date; updatedAt: Date }>,
    rooms: [] as DealRoomRecord[],
    members: [] as Array<{ id: string; dealRoomId: string; roommateProfileId: string; snapshot: RoommateRecord; createdAt: Date }>,
    tours: [] as Array<{ id: string; dealRoomId: string; requesterId: string; status: string; createdAt: Date; updatedAt: Date }>
  };

  const roommate: RoommateRecord = {
    id: "roommate-1",
    name: "Mia Chen",
    age: 22,
    role: "BU MSBA · Fall",
    image: "https://example.com/mia.jpg",
    match: 94,
    budget: "$1,450/月",
    commute: "Fenway / Back Bay",
    tags: ["早睡", "安静"],
    createdAt: new Date("2026-01-01T00:00:00.000Z")
  };
  const mock = {
    roommateProfile: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === roommate.id ? roommate : null)
    },
    listing: {
      findManyCalls: [] as Array<{
        where?: { status?: ListingStatus };
        orderBy?: { score?: "asc" | "desc" };
        take?: number;
      }>,
      findMany: async (
        args: {
          where?: { status?: ListingStatus };
          orderBy?: { score?: "asc" | "desc" };
          take?: number;
        } = {}
      ) => {
        mock.listing.findManyCalls.push(args);
        const filtered = listings.filter((listing) => !args.where?.status || listing.status === args.where.status);
        const sorted = [...filtered].sort((first, second) =>
          args.orderBy?.score === "desc" ? second.score - first.score : 0
        );
        return typeof args.take === "number" ? sorted.slice(0, args.take) : sorted;
      }
    },
    roommateAction: {
      upsertCalls: [] as Array<{ where: { userId_roommateProfileId: { userId: string; roommateProfileId: string } }; create: unknown; update: unknown }>,
      upsert: async (args: { where: { userId_roommateProfileId: { userId: string; roommateProfileId: string } }; create: { userId: string; roommateProfileId: string; action: string }; update: { action: string } }) => {
        mock.roommateAction.upsertCalls.push(args);
        const existing = state.actions.find(
          (action) =>
            action.userId === args.where.userId_roommateProfileId.userId &&
            action.roommateProfileId === args.where.userId_roommateProfileId.roommateProfileId
        );
        if (existing) {
          existing.action = args.update.action;
          existing.updatedAt = new Date();
          return existing;
        }

        const created = {
          id: `action-${state.actions.length + 1}`,
          ...args.create,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.actions.push(created);
        return created;
      }
    },
    dealRoom: {
      createCalls: [] as Array<{ data: { ownerId: string; roommateProfileId: string; status: "ACTIVE"; recommendedHomes: unknown; pipeline: unknown; trustChecklist: unknown } }>,
      findUnique: async ({ where }: { where: { ownerId_roommateProfileId?: { ownerId: string; roommateProfileId: string }; id?: string } }) => {
        if (where.ownerId_roommateProfileId) {
          return state.rooms.find(
            (room) =>
              room.ownerId === where.ownerId_roommateProfileId!.ownerId &&
              room.roommateProfileId === where.ownerId_roommateProfileId!.roommateProfileId
          ) ?? null;
        }

        return state.rooms.find((room) => room.id === where.id) ?? null;
      },
      findFirst: async ({ where }: { where: { id: string; ownerId: string } }) =>
        state.rooms.find((room) => room.id === where.id && room.ownerId === where.ownerId) ?? null,
      findMany: async ({ where }: { where: { ownerId: string; status: "ACTIVE" } }) =>
        state.rooms.filter((room) => room.ownerId === where.ownerId && room.status === where.status),
      create: async (args: { data: { ownerId: string; roommateProfileId: string; status: "ACTIVE"; recommendedHomes: unknown; pipeline: unknown; trustChecklist: unknown } }) => {
        mock.dealRoom.createCalls.push(args);
        const created = {
          id: `deal-room-${state.rooms.length + 1}`,
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.rooms.push(created);
        return created;
      }
    },
    dealRoomMember: {
      upsertCalls: [] as Array<{ where: { dealRoomId_roommateProfileId: { dealRoomId: string; roommateProfileId: string } }; create: unknown; update: unknown }>,
      upsert: async (args: { where: { dealRoomId_roommateProfileId: { dealRoomId: string; roommateProfileId: string } }; create: { dealRoomId: string; roommateProfileId: string; snapshot: RoommateRecord }; update: { snapshot: RoommateRecord } }) => {
        mock.dealRoomMember.upsertCalls.push(args);
        const existing = state.members.find(
          (member) =>
            member.dealRoomId === args.where.dealRoomId_roommateProfileId.dealRoomId &&
            member.roommateProfileId === args.where.dealRoomId_roommateProfileId.roommateProfileId
        );
        if (existing) {
          existing.snapshot = args.update.snapshot;
          return existing;
        }

        const created = {
          id: `member-${state.members.length + 1}`,
          ...args.create,
          createdAt: new Date()
        };
        state.members.push(created);
        return created;
      }
    },
    tourRequest: {
      createCalls: [] as Array<{ data: { dealRoomId: string; requesterId: string; status: string } }>,
      upsert: async (args: { where: { dealRoomId: string }; create: { dealRoomId: string; requesterId: string; status: string }; update: Record<string, never> }) => {
        const existing = state.tours.find((tour) => tour.dealRoomId === args.where.dealRoomId);
        if (existing) return existing;

        mock.tourRequest.createCalls.push({ data: args.create });
        const created = {
          id: `tour-${state.tours.length + 1}`,
          ...args.create,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        state.tours.push(created);
        return created;
      }
    }
  };

  return mock;
}

function listingRecord(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: "listing-1",
    title: "Fenway verified sublet",
    area: "Boston - Fenway",
    image: "https://example.com/home.jpg",
    price: 1420,
    originalPrice: 1680,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes to Back Bay",
    trust: ".edu verified",
    tags: ["Group friendly", "video tour"],
    score: 4.92,
    status: "APPROVED",
    ...overrides
  };
}
