import { NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";

describe("DealRoomsService", () => {
  it("records a roommate action without eagerly creating a deal room", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const result = await service.recordRoommateAction({
      userId: "user-1",
      roommateProfileId: "roommate-1",
      action: "LIKE",
      createDealRoom: true
    });

    expect(result.action.action).toBe("LIKE");
    expect(result.dealRoom).toBeNull();
    expect(prisma.roommateAction.upsertCalls[0].where.userId_roommateProfileId).toEqual({
      userId: "user-1",
      roommateProfileId: "roommate-1"
    });
    expect(prisma.dealRoom.createCalls).toHaveLength(0);
    expect(prisma.dealRoomMember.upsertCalls).toHaveLength(0);
  });

  it("creates and reuses one deal room with both member snapshots after team confirmation", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const first = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");
    const second = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");

    expect(first.id).toBe(second.id);
    expect(prisma.dealRoom.createCalls).toHaveLength(1);
    expect(prisma.dealRoomMember.upsertCalls).toHaveLength(4);
    expect(prisma.dealRoomMember.rows.map((member) => member.roommateProfileId).sort()).toEqual([
      "roommate-1",
      "roommate-2"
    ]);
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

  it("recommends only approved database listings when confirming a team", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({ id: "draft-listing", status: "DRAFT", score: 5 }),
        listingRecord({ id: "approved-listing", status: "APPROVED", score: 4.5 })
      ]
    });
    const service = new DealRoomsService(prisma as never);

    const result = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");

    expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
    expect(result.recommendedHomes).toMatchObject([{ id: "approved-listing" }]);
    expect(JSON.stringify(result.recommendedHomes)).not.toContain("draft-listing");
  });

  it("keeps recommendations empty when no approved database listings exist", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft-listing", status: "DRAFT" })]
    });
    const service = new DealRoomsService(prisma as never);

    const result = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");

    expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
    expect(result.recommendedHomes).toEqual([]);
  });

  it("creates a tour request for an owned deal room idempotently", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const room = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");
    const first = await service.requestGroupTour("user-1", room.id);
    const second = await service.requestGroupTour("user-1", room.id);

    expect(first.id).toBe(second.id);
    expect(first.status).toBe("REQUESTED");
    expect(prisma.tourRequest.createCalls).toHaveLength(1);
  });

  it("rejects new tours on archived rooms", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);
    const room = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");
    prisma.dealRoom.rows[0]!.status = "ARCHIVED";
    await expect(service.requestGroupTour("user-1", room.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.tourRequest.createCalls).toHaveLength(0);
  });

  it("rejects tour requests for deal rooms owned by another user", async () => {
    const prisma = createPrismaMock();
    const service = new DealRoomsService(prisma as never);

    const room = await service.ensureForConfirmedTeam(prisma as never, "user-1", "user-2");

    await expect(service.requestGroupTour("user-2", room.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

type RoommateRecord = {
  id: string;
  ownerId: string;
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

  const roommates: RoommateRecord[] = [
    {
      id: "roommate-1",
      ownerId: "user-1",
      name: "Mia Chen",
      age: 22,
      role: "BU MSBA · Fall",
      image: "https://example.com/mia.jpg",
      match: 94,
      budget: "$1,450/月",
      commute: "Fenway / Back Bay",
      tags: ["早睡", "安静"],
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    },
    {
      id: "roommate-2",
      ownerId: "user-2",
      name: "Noah Li",
      age: 23,
      role: "NEU MSCS · Fall",
      image: "https://example.com/noah.jpg",
      match: 91,
      budget: "$1,500/月",
      commute: "Fenway / Back Bay",
      tags: ["整洁", "早睡"],
      createdAt: new Date("2026-01-02T00:00:00.000Z")
    }
  ];
  const mock = {
    $transaction: async (operation: (transaction: any) => Promise<any>): Promise<any> => operation(mock),
    roommateProfile: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        roommates.find((roommate) => roommate.id === where.id) ?? null,
      findMany: async ({ where }: { where: { ownerId: { in: string[] } } }) =>
        roommates.filter((roommate) => where.ownerId.in.includes(roommate.ownerId))
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
      updateMany: async ({ where, data }: any) => {
        const rooms = state.rooms.filter(room => Object.entries(where).every(([key, value]) => (room as any)[key] === value));
        rooms.forEach(room => Object.assign(room, data));
        return { count: rooms.length };
      },
      rows: state.rooms,
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
      findFirst: async ({ where }: { where: { id?: string; ownerId?: string; status?: string; OR?: Array<Record<string, string>> } }) =>
        state.rooms.find((room) => {
          if (where.id && room.id !== where.id) return false;
          if (where.ownerId && room.ownerId !== where.ownerId) return false;
          if (where.status && room.status !== where.status) return false;
          if (where.OR && !where.OR.some((branch) =>
            (!branch.ownerId || room.ownerId === branch.ownerId) &&
            (!branch.roommateProfileId || room.roommateProfileId === branch.roommateProfileId)
          )) return false;
          return true;
        }) ?? null,
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
      rows: state.members,
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
