import { describe, expect, it } from "vitest";

import { GroupsController } from "../src/groups/groups.controller";
import { GroupsService } from "../src/groups/groups.service";
import { seedGroups, seedTrips, seedTrustQueues } from "../src/seed-data";
import { TripsController } from "../src/trips/trips.controller";
import { TripsService } from "../src/trips/trips.service";
import { TrustController } from "../src/trust/trust.controller";
import { TrustService } from "../src/trust/trust.service";

type GroupRecord = {
  id: string;
  name: string;
  budget: string;
  members: unknown;
  createdAt: Date;
};

type BookingRecord = {
  id: string;
  listingId: string;
  title: string;
  amount: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type TrustQueueRecord = {
  id: string;
  label: string;
  value: number;
  variant: string;
  createdAt: Date;
  updatedAt: Date;
};

describe("GroupsService", () => {
  it("returns database groups ordered newest first", async () => {
    const prisma = createPrismaMock({ groups: [groupRecord({ id: "group-db-1" })] });
    const service = new GroupsService(prisma as never);

    await expect(service.findAll()).resolves.toMatchObject([{ id: "group-db-1" }]);
    expect(prisma.group.findManyCalls).toEqual([{ orderBy: { createdAt: "desc" } }]);
  });

  it("keeps the seed fallback when no database groups exist", async () => {
    const prisma = createPrismaMock({ groups: [] });
    const service = new GroupsService(prisma as never);

    await expect(service.findAll()).resolves.toEqual(seedGroups);
  });
});

describe("GroupsController", () => {
  it("delegates group reads to GroupsService", async () => {
    const groups = createGroupsServiceMock();
    const controller = new GroupsController(groups as never);

    await expect(controller.findAll()).resolves.toEqual([{ id: "group-1" }]);
    expect(groups.findAllCalls).toBe(1);
  });
});

describe("TripsService", () => {
  it("returns database bookings ordered newest first", async () => {
    const prisma = createPrismaMock({ bookings: [bookingRecord({ id: "booking-db-1" })] });
    const service = new TripsService(prisma as never);

    await expect(service.findAll()).resolves.toMatchObject([{ id: "booking-db-1" }]);
    expect(prisma.booking.findManyCalls).toEqual([{ orderBy: { createdAt: "desc" } }]);
  });

  it("keeps the seed fallback when no database bookings exist", async () => {
    const prisma = createPrismaMock({ bookings: [] });
    const service = new TripsService(prisma as never);

    await expect(service.findAll()).resolves.toEqual(seedTrips);
  });
});

describe("TripsController", () => {
  it("delegates trip reads to TripsService", async () => {
    const trips = createTripsServiceMock();
    const controller = new TripsController(trips as never);

    await expect(controller.findAll()).resolves.toEqual([{ id: "trip-1" }]);
    expect(trips.findAllCalls).toBe(1);
  });
});

describe("TrustService", () => {
  it("returns database queue rows ordered by newest update first", async () => {
    const prisma = createPrismaMock({ trustQueueItems: [trustQueueRecord({ id: "trust-db-1" })] });
    const service = new TrustService(prisma as never);

    await expect(service.queues()).resolves.toMatchObject([{ id: "trust-db-1" }]);
    expect(prisma.trustQueueItem.findManyCalls).toEqual([{ orderBy: { updatedAt: "desc" } }]);
  });

  it("keeps the seed fallback when no database queue rows exist", async () => {
    const prisma = createPrismaMock({ trustQueueItems: [] });
    const service = new TrustService(prisma as never);

    await expect(service.queues()).resolves.toEqual(seedTrustQueues);
  });
});

describe("TrustController", () => {
  it("delegates trust queue reads to TrustService", async () => {
    const trust = createTrustServiceMock();
    const controller = new TrustController(trust as never);

    await expect(controller.queues()).resolves.toEqual([{ id: "trust-1" }]);
    expect(trust.queuesCalls).toBe(1);
  });
});

function groupRecord(overrides: Partial<GroupRecord> = {}): GroupRecord {
  return {
    id: "group-db",
    name: "Database group",
    budget: "$4,800/month",
    members: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function bookingRecord(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: "booking-db",
    listingId: "listing-1",
    title: "Database booking",
    amount: 1800,
    status: "funds_held",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function trustQueueRecord(overrides: Partial<TrustQueueRecord> = {}): TrustQueueRecord {
  return {
    id: "trust-db",
    label: "Database trust queue",
    value: 4,
    variant: "warning",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function createPrismaMock({
  groups = [],
  bookings = [],
  trustQueueItems = []
}: {
  groups?: GroupRecord[];
  bookings?: BookingRecord[];
  trustQueueItems?: TrustQueueRecord[];
} = {}) {
  const mock = {
    group: {
      findManyCalls: [] as Array<{ orderBy?: { createdAt?: "asc" | "desc" } }>,
      findMany: async (args: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) => {
        mock.group.findManyCalls.push(args);
        return groups;
      }
    },
    booking: {
      findManyCalls: [] as Array<{ orderBy?: { createdAt?: "asc" | "desc" } }>,
      findMany: async (args: { orderBy?: { createdAt?: "asc" | "desc" } } = {}) => {
        mock.booking.findManyCalls.push(args);
        return bookings;
      }
    },
    trustQueueItem: {
      findManyCalls: [] as Array<{ orderBy?: { updatedAt?: "asc" | "desc" } }>,
      findMany: async (args: { orderBy?: { updatedAt?: "asc" | "desc" } } = {}) => {
        mock.trustQueueItem.findManyCalls.push(args);
        return trustQueueItems;
      }
    }
  };

  return mock;
}

function createGroupsServiceMock() {
  const service = {
    findAllCalls: 0,
    findAll: async () => {
      service.findAllCalls += 1;
      return [{ id: "group-1" }];
    }
  };

  return service;
}

function createTripsServiceMock() {
  const service = {
    findAllCalls: 0,
    findAll: async () => {
      service.findAllCalls += 1;
      return [{ id: "trip-1" }];
    }
  };

  return service;
}

function createTrustServiceMock() {
  const service = {
    queuesCalls: 0,
    queues: async () => {
      service.queuesCalls += 1;
      return [{ id: "trust-1" }];
    }
  };

  return service;
}
