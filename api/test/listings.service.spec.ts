import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { ListingDto } from "../src/listings/dto";
import { ListingsService } from "../src/listings/listings.service";

type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ListingRecord = {
  id: string;
  ownerId: string;
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
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewerId: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ListingMediaRecord = {
  id: string;
  listingId: string;
  url: string;
  kind: string;
  sortOrder: number;
  createdAt: Date;
};

type ListingWhere = {
  id?: string;
  ownerId?: string;
  status?: ListingStatus;
};

type ListingOrderBy = {
  createdAt?: "asc" | "desc";
  updatedAt?: "asc" | "desc";
  submittedAt?: "asc" | "desc";
};

type ListingInclude = {
  media?: {
    orderBy?: {
      sortOrder?: "asc" | "desc";
    };
  };
};

type ListingFindManyArgs = {
  where?: ListingWhere;
  orderBy?: ListingOrderBy;
  include?: ListingInclude;
};

type ListingFindUniqueArgs = {
  where: {
    id: string;
  };
  include?: ListingInclude;
};

type ListingCreateArgs = {
  data: Partial<ListingRecord> & Pick<ListingRecord, "ownerId" | "title">;
};

type ListingUpdateArgs = {
  where: {
    id: string;
  };
  data: Partial<ListingRecord>;
};

type ListingMediaCreateArgs = {
  data: Pick<ListingMediaRecord, "listingId" | "url" | "kind" | "sortOrder">;
};

type PublishProfile = {
  email: string;
  displayName: string | null;
  school: string | null;
  city: string | null;
  role: string;
};

describe("ListingsService", () => {
  it("returns only approved database listings for public discovery", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" }),
        listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })
      ]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findAll()).resolves.toMatchObject([{ id: "approved" }]);
  });

  it("returns an empty public catalog when no approved database listings exist", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("returns approved database listings for public detail reads", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findOne("approved")).resolves.toMatchObject({ id: "approved" });
  });

  it("returns approved detail reads with media sorted by sort order", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "approved", sortOrder: 2 }),
        mediaRecord({ id: "media-1", listingId: "approved", sortOrder: 1 })
      ]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findOne("approved")).resolves.toMatchObject({
      id: "approved",
      media: [{ id: "media-1" }, { id: "media-2" }]
    });
    expect(prisma.listing.findUniqueCalls[0]?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } }
    });
  });

  it("hides non-approved database listings from public detail reads", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findOne("draft")).rejects.toThrow(NotFoundException);
  });

  it("does not expose a non-approved database listing by id", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "rejected", ownerId: "owner-1", status: "REJECTED" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findOne("rejected")).rejects.toThrow(NotFoundException);
  });

  it("creates draft listings even when a client sends review status data", async () => {
    const prisma = createPrismaMock();
    const service = new ListingsService(prisma as never);

    const listing = await service.create("owner-1", {
      ...listingDto(),
      status: "APPROVED"
    } as ListingDto);

    expect(listing.status).toBe("DRAFT");
    expect(prisma.listing.createCalls[0]?.data.status).toBe("DRAFT");
  });

  it.each([
    ["blank display name", { displayName: " " }],
    ["blank school", { school: " " }],
    ["blank city", { city: " " }],
    ["renter role", { role: "renter" }]
  ])("blocks listing creation for a profile with %s", async (_label, profileOverrides) => {
    const prisma = createPrismaMock({
      profiles: [publishProfile(profileOverrides)]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.create("owner-1", listingDto())).rejects.toThrow(ForbiddenException);
    expect(prisma.listing.createCalls).toHaveLength(0);
  });

  it.each(["lister", "both"] as const)("allows a complete %s profile to create listings", async (role) => {
    const prisma = createPrismaMock({
      profiles: [publishProfile({ role })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.create("owner-1", listingDto())).resolves.toMatchObject({
      ownerId: "owner-1",
      status: "DRAFT"
    });
  });

  it("lists all listings owned by the current user", async () => {
    const newer = listingRecord({
      id: "newer",
      ownerId: "owner-1",
      status: "SUBMITTED",
      updatedAt: new Date("2026-01-02T00:00:00.000Z")
    });
    const older = listingRecord({
      id: "older",
      ownerId: "owner-1",
      status: "DRAFT",
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });
    const other = listingRecord({ id: "other", ownerId: "owner-2", status: "APPROVED" });
    const prisma = createPrismaMock({ listings: [older, newer, other] });
    const service = new ListingsService(prisma as never);

    await expect(service.findMine("owner-1")).resolves.toMatchObject([{ id: "newer" }, { id: "older" }]);
  });

  it("lists current-user listings with sorted media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "listing-1", sortOrder: 2 }),
        mediaRecord({ id: "media-1", listingId: "listing-1", sortOrder: 1 })
      ]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findMine("owner-1")).resolves.toMatchObject([
      {
        id: "listing-1",
        media: [{ id: "media-1" }, { id: "media-2" }]
      }
    ]);
    expect(prisma.listing.findManyCalls[0]?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } }
    });
  });

  it.each(["DRAFT", "REJECTED"] as const)("allows owners to add media to %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never);

    const media = await service.addMedia("owner-1", "listing-1", {
      url: "https://example.com/bedroom.jpg",
      kind: "bedroom",
      sortOrder: 2
    });

    expect(media).toMatchObject({
      listingId: "listing-1",
      url: "https://example.com/bedroom.jpg",
      kind: "bedroom",
      sortOrder: 2
    });
    expect(prisma.listingMedia.createCalls[0]?.data).toEqual({
      listingId: "listing-1",
      url: "https://example.com/bedroom.jpg",
      kind: "bedroom",
      sortOrder: 2
    });
  });

  it.each(["add media", "update", "submit"] as const)(
    "blocks %s for an owner whose publish profile is incomplete",
    async (operation) => {
      const prisma = createPrismaMock({
        listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
        profiles: [publishProfile({ school: null })]
      });
      const service = new ListingsService(prisma as never);

      const result =
        operation === "add media"
          ? service.addMedia("owner-1", "listing-1", {
              url: "https://example.com/bedroom.jpg",
              kind: "bedroom",
              sortOrder: 1
            })
          : operation === "update"
            ? service.update("owner-1", "listing-1", { title: "Updated title" })
            : service.submit("owner-1", "listing-1");

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(prisma.listingMedia.createCalls).toHaveLength(0);
      expect(prisma.listing.updateCalls).toHaveLength(0);
    }
  );

  it.each(["add media", "update", "submit"] as const)(
    "blocks %s for an owner whose complete profile is renter-only",
    async (operation) => {
      const prisma = createPrismaMock({
        listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
        profiles: [publishProfile({ role: "renter" })]
      });
      const service = new ListingsService(prisma as never);

      const result =
        operation === "add media"
          ? service.addMedia("owner-1", "listing-1", {
              url: "https://example.com/bedroom.jpg",
              kind: "bedroom",
              sortOrder: 1
            })
          : operation === "update"
            ? service.update("owner-1", "listing-1", { title: "Updated title" })
            : service.submit("owner-1", "listing-1");

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(prisma.listingMedia.createCalls).toHaveLength(0);
      expect(prisma.listing.updateCalls).toHaveLength(0);
    }
  );

  it("returns not found when a non-owner adds media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(
      service.addMedia("owner-2", "listing-1", {
        url: "https://example.com/bedroom.jpg",
        kind: "bedroom",
        sortOrder: 1
      })
    ).rejects.toThrow(NotFoundException);
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from adding media to %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never);

    await expect(
      service.addMedia("owner-1", "listing-1", {
        url: "https://example.com/bedroom.jpg",
        kind: "bedroom",
        sortOrder: 1
      })
    ).rejects.toThrow(BadRequestException);
  });

  it.each(["DRAFT", "REJECTED"] as const)("allows owners to update %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never);

    const updated = await service.update("owner-1", "listing-1", { title: "Updated title" });

    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe(status);
  });

  it("ignores client-provided review status when owners update listings", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    const updated = await service.update("owner-1", "listing-1", {
      title: "Updated title",
      status: "APPROVED"
    } as Partial<ListingDto>);

    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe("DRAFT");
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from updating %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never);

    await expect(service.update("owner-1", "listing-1", { title: "Updated title" })).rejects.toThrow(BadRequestException);
  });

  it("returns not found when a non-owner updates a listing", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.update("owner-2", "listing-1", { title: "Updated title" })).rejects.toThrow(NotFoundException);
  });

  it("rejects empty direct service updates before calling Prisma", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.update("owner-1", "listing-1", {})).rejects.toThrow(BadRequestException);
  });

  it.each(["DRAFT", "REJECTED"] as const)("allows owners to submit %s listings", async (status) => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({
          id: "listing-1",
          ownerId: "owner-1",
          status,
          reviewedAt: new Date("2026-01-01T00:00:00.000Z"),
          reviewerId: "admin-1",
          rejectionReason: "Needs clearer photos"
        })
      ]
    });
    const service = new ListingsService(prisma as never);

    const submitted = await service.submit("owner-1", "listing-1");

    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(submitted.reviewedAt).toBeNull();
    expect(submitted.reviewerId).toBeNull();
    expect(submitted.rejectionReason).toBeNull();
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from submitting %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never);

    await expect(service.submit("owner-1", "listing-1")).rejects.toThrow(BadRequestException);
  });

  it("returns not found when a non-owner submits a listing", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.submit("owner-2", "listing-1")).rejects.toThrow(NotFoundException);
  });

  it("returns submitted listings ordered by oldest submission first", async () => {
    const newer = listingRecord({
      id: "newer",
      status: "SUBMITTED",
      submittedAt: new Date("2026-01-02T00:00:00.000Z")
    });
    const older = listingRecord({
      id: "older",
      status: "SUBMITTED",
      submittedAt: new Date("2026-01-01T00:00:00.000Z")
    });
    const draft = listingRecord({ id: "draft", status: "DRAFT" });
    const prisma = createPrismaMock({ listings: [newer, older, draft] });
    const service = new ListingsService(prisma as never);

    await expect(service.findReviewQueue()).resolves.toMatchObject([{ id: "older" }, { id: "newer" }]);
  });

  it("returns submitted listings for review with sorted media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "submitted", status: "SUBMITTED" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "submitted", sortOrder: 2 }),
        mediaRecord({ id: "media-1", listingId: "submitted", sortOrder: 1 })
      ]
    });
    const service = new ListingsService(prisma as never);

    await expect(service.findReviewQueue()).resolves.toMatchObject([
      {
        id: "submitted",
        media: [{ id: "media-1" }, { id: "media-2" }]
      }
    ]);
    expect(prisma.listing.findManyCalls[0]?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } }
    });
  });

  it("approves submitted listings and records reviewer metadata", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never);

    const approved = await service.approve("listing-1", "admin-1");

    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedAt).toBeInstanceOf(Date);
    expect(approved.reviewerId).toBe("admin-1");
    expect(approved.rejectionReason).toBeNull();
  });

  it("rejects submitted listings with a safe reason", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never);

    const rejected = await service.reject("listing-1", "admin-1", "Please add clearer bedroom photos");

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.reviewedAt).toBeInstanceOf(Date);
    expect(rejected.reviewerId).toBe("admin-1");
    expect(rejected.rejectionReason).toBe("Please add clearer bedroom photos");
  });

  it("requires a non-empty rejection reason", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never);

    await expect(service.reject("listing-1", "admin-1", "   ")).rejects.toThrow(BadRequestException);
  });

  it.each(["DRAFT", "APPROVED", "REJECTED"] as const)("blocks admin review for %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status })] });
    const service = new ListingsService(prisma as never);

    await expect(service.approve("listing-1", "admin-1")).rejects.toThrow(BadRequestException);
    await expect(service.reject("listing-1", "admin-1", "Reason")).rejects.toThrow(BadRequestException);
  });
});

function listingDto(overrides: Partial<ListingDto> = {}): ListingDto {
  return {
    title: "Fenway verified sublet",
    area: "Boston - Fenway",
    image: "https://example.com/home.jpg",
    price: 1420,
    originalPrice: 1680,
    beds: 1,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes by train to Back Bay",
    trust: ".edu verified",
    tags: ["private bath", "elevator"],
    score: 4.92,
    ...overrides
  };
}

function listingRecord(overrides: Partial<ListingRecord> = {}): ListingRecord {
  const dto = listingDto();

  return {
    id: "listing-1",
    ownerId: "owner-1",
    title: dto.title,
    area: dto.area,
    image: dto.image,
    price: dto.price,
    originalPrice: dto.originalPrice,
    beds: dto.beds,
    baths: dto.baths,
    commute: dto.commute,
    transit: dto.transit,
    trust: dto.trust,
    tags: dto.tags,
    status: "DRAFT",
    submittedAt: null,
    reviewedAt: null,
    reviewerId: null,
    rejectionReason: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
    score: overrides.score ?? dto.score ?? 4.92
  };
}

function mediaRecord(overrides: Partial<ListingMediaRecord> = {}): ListingMediaRecord {
  return {
    id: "media-1",
    listingId: "listing-1",
    url: "https://example.com/bedroom.jpg",
    kind: "bedroom",
    sortOrder: 1,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function publishProfile(overrides: Partial<PublishProfile> = {}): PublishProfile {
  return {
    email: "owner-1@example.com",
    displayName: "Maya Chen",
    school: "UCLA",
    city: "Los Angeles",
    role: "lister",
    ...overrides
  };
}

function createPrismaMock({
  listings = [],
  media = [],
  profiles = [publishProfile(), publishProfile({ email: "owner-2@example.com" })]
}: {
  listings?: ListingRecord[];
  media?: ListingMediaRecord[];
  profiles?: PublishProfile[];
} = {}) {
  const records = listings.map((listing) => ({ ...listing }));
  const mediaRecords = media.map((item) => ({ ...item }));
  const profileRecords = profiles.map((profile) => ({ ...profile }));
  const mock = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        if (where.id === "owner-1") return { id: "owner-1", email: "owner-1@example.com" };
        if (where.id === "owner-2") return { id: "owner-2", email: "owner-2@example.com" };
        return null;
      }
    },
    profile: {
      findUnique: async ({ where }: { where: { email: string } }) =>
        profileRecords.find((profile) => profile.email === where.email) ?? null
    },
    listing: {
      createCalls: [] as ListingCreateArgs[],
      findManyCalls: [] as ListingFindManyArgs[],
      findUniqueCalls: [] as ListingFindUniqueArgs[],
      updateCalls: [] as ListingUpdateArgs[],
      findMany: async (args: ListingFindManyArgs = {}) => {
        mock.listing.findManyCalls.push(args);
        const filtered = records.filter((listing) => matchesWhere(listing, args.where));
        return sortListings(filtered, args.orderBy).map((listing) => withListingIncludes(listing, mediaRecords, args.include));
      },
      findUnique: async (args: ListingFindUniqueArgs) => {
        mock.listing.findUniqueCalls.push(args);
        const listing = records.find((record) => record.id === args.where.id);
        return listing ? withListingIncludes(listing, mediaRecords, args.include) : null;
      },
      create: async (args: ListingCreateArgs) => {
        mock.listing.createCalls.push(args);
        const record = listingRecord({
          id: `listing-${records.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: "DRAFT",
          ...args.data
        });
        records.push(record);
        return record;
      },
      update: async (args: ListingUpdateArgs) => {
        mock.listing.updateCalls.push(args);
        const index = records.findIndex((listing) => listing.id === args.where.id);
        if (index === -1) throw new Error(`Missing listing ${args.where.id}`);

        const updated = {
          ...records[index],
          ...args.data,
          updatedAt: args.data.updatedAt ?? new Date()
        };
        records[index] = updated;
        return updated;
      }
    },
    listingMedia: {
      createCalls: [] as ListingMediaCreateArgs[],
      create: async (args: ListingMediaCreateArgs) => {
        mock.listingMedia.createCalls.push(args);
        const created = mediaRecord({
          id: `media-${mediaRecords.length + 1}`,
          createdAt: new Date(),
          ...args.data
        });
        mediaRecords.push(created);
        return created;
      }
    }
  };

  return mock;
}

function matchesWhere(listing: ListingRecord, where: ListingWhere = {}) {
  if (where.id && listing.id !== where.id) return false;
  if (where.ownerId && listing.ownerId !== where.ownerId) return false;
  if (where.status && listing.status !== where.status) return false;
  return true;
}

function sortListings(listings: ListingRecord[], orderBy: ListingOrderBy = {}) {
  const [field, direction] = Object.entries(orderBy)[0] ?? [];
  if (!field || !direction) return [...listings];

  return [...listings].sort((first, second) => {
    const firstTime = dateValue(first[field as keyof ListingOrderBy]);
    const secondTime = dateValue(second[field as keyof ListingOrderBy]);
    return direction === "asc" ? firstTime - secondTime : secondTime - firstTime;
  });
}

function dateValue(value: unknown) {
  return value instanceof Date ? value.getTime() : 0;
}

function withListingIncludes(listing: ListingRecord, media: ListingMediaRecord[], include?: ListingInclude) {
  if (!include?.media) return listing;

  const sortedMedia = [...media]
    .filter((item) => item.listingId === listing.id)
    .sort((first, second) =>
      include.media?.orderBy?.sortOrder === "desc" ? second.sortOrder - first.sortOrder : first.sortOrder - second.sortOrder
    );

  return {
    ...listing,
    media: sortedMedia
  };
}
