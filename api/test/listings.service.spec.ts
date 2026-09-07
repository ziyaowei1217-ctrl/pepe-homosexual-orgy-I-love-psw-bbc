import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { AuditActor, AuditService } from "../src/audit/audit.service";
import { ListingDto } from "../src/listings/dto";
import { ListingsService } from "../src/listings/listings.service";

type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

type ListingRecord = {
  id: string;
  ownerId: string;
  title: string;
  area: string;
  image: string | null;
  availableFrom: Date;
  availableTo: Date;
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
  revision: number;
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
  url: string | null;
  kind: string;
  sortOrder: number;
  originalKey: string | null;
  processedKey: string | null;
  publicMainKey: string | null;
  publicThumbnailKey: string | null;
  storageStatus: "PENDING_UPLOAD" | "READY" | "PUBLISHED" | "FAILED";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  publishedAt: Date | null;
  createdAt: Date;
};

type ListingWhere = {
  id?: string;
  ownerId?: string;
  status?: ListingStatus;
  revision?: number;
  availableFrom?: { lte: Date };
  availableTo?: { gte: Date };
};

type ListingOrderBy = {
  createdAt?: "asc" | "desc";
  updatedAt?: "asc" | "desc";
  submittedAt?: "asc" | "desc";
};

type ListingInclude = {
  media?: {
    where?: {
      storageStatus?: ListingMediaRecord["storageStatus"];
    };
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

type ListingUpdateManyArgs = {
  where: ListingWhere & { id: string };
  data: Omit<Partial<ListingRecord>, "revision"> & { revision?: number | { increment: number } };
};

type ListingMediaCreateArgs = {
  data: Pick<ListingMediaRecord, "listingId" | "url" | "kind" | "sortOrder">;
};

type ListingMediaUpdateManyArgs = {
  where: { listingId: string; storageStatus: "READY" };
  data: Partial<ListingMediaRecord>;
};

type PublishProfile = {
  email: string;
  displayName: string | null;
  school: string | null;
  city: string | null;
  role: string;
};

const auditActor: AuditActor = {
  actorType: "USER",
  actorUserId: "admin-1",
  actorEmail: "admin-1@example.com",
  requestId: "request-1"
};
const reviewListingId = "cm4w7x8h90000u9p4gn5n7v2a";

describe("ListingsService", () => {
  it("returns only approved database listings for public discovery", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" }),
        listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findAll()).resolves.toMatchObject([{ id: "approved" }]);
  });

  it("returns published media in cover order for public discovery", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "approved", status: "APPROVED" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "approved", sortOrder: 2, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "media-1", listingId: "approved", sortOrder: 1, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "media-ready", listingId: "approved", sortOrder: 0, storageStatus: "READY" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findAll()).resolves.toMatchObject([
      {
        id: "approved",
        media: [
          { id: "media-1", contentUrl: "/api/v1/listing-media/media-1/content" },
          { id: "media-2", contentUrl: "/api/v1/listing-media/media-2/content" }
        ]
      }
    ]);
    expect(prisma.listing.findManyCalls[0]?.include).toEqual({
      media: {
        where: { storageStatus: "PUBLISHED" },
        orderBy: { sortOrder: "asc" }
      }
    });
  });

  it("returns only approved listings that fully cover the requested stay", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({
          id: "full-cover",
          status: "APPROVED",
          availableFrom: new Date("2026-08-20T00:00:00.000Z"),
          availableTo: new Date("2026-09-20T00:00:00.000Z")
        }),
        listingRecord({
          id: "starts-late",
          status: "APPROVED",
          availableFrom: new Date("2026-08-21T00:00:00.000Z"),
          availableTo: new Date("2026-09-20T00:00:00.000Z")
        }),
        listingRecord({
          id: "ends-early",
          status: "APPROVED",
          availableFrom: new Date("2026-08-20T00:00:00.000Z"),
          availableTo: new Date("2026-09-19T00:00:00.000Z")
        })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(
      service.findAll({ moveIn: "2026-08-20", moveOut: "2026-09-20" })
    ).resolves.toMatchObject([{ id: "full-cover" }]);
  });

  it.each([
    ["房东知情声明 · 待平台审核", "房东知情声明 · 平台已审核"],
    ["待审核", "平台已审核"],
    [
      "房东知情声明 · 平台已审核 · 待平台审核 · 待审核 · 平台已审核",
      "房东知情声明 · 平台已审核"
    ],
    ["待平台审核 · 平台已审核 · 待审核", "平台已审核"],
    [".edu verified", ".edu verified · 平台已审核"],
    ["", "平台已审核"],
    ["房东知情 · 平台已审核", "房东知情 · 平台已审核"]
  ])("presents approved public trust without mutating the stored declaration", async (trust, expectedTrust) => {
    const stored = listingRecord({ id: "approved", status: "APPROVED", trust });
    const prisma = createPrismaMock({ listings: [stored] });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findAll()).resolves.toMatchObject([
      { id: "approved", status: "APPROVED", trust: expectedTrust }
    ]);
    expect(prisma.listing.rows[0]?.trust).toBe(trust);
  });

  it("presents the same approved trust semantics on public detail reads", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({
        id: "approved",
        status: "APPROVED",
        trust: "房东知情声明 · 待平台审核"
      })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findOne("approved")).resolves.toMatchObject({
      id: "approved",
      trust: "房东知情声明 · 平台已审核"
    });
  });

  it("returns an empty public catalog when no approved database listings exist", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findAll()).resolves.toEqual([]);
  });

  it("returns approved database listings for public detail reads", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findOne("approved")).resolves.toMatchObject({ id: "approved" });
  });

  it("returns approved detail reads with media sorted by sort order", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "approved", sortOrder: 2, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "media-1", listingId: "approved", sortOrder: 1, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "private", listingId: "approved", sortOrder: 0, storageStatus: "PENDING_UPLOAD" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findOne("approved")).resolves.toMatchObject({
      id: "approved",
      media: [{ id: "media-1" }, { id: "media-2" }]
    });
    expect(prisma.listing.findUniqueCalls[0]?.include).toEqual({
      media: { where: { storageStatus: "PUBLISHED" }, orderBy: { sortOrder: "asc" } }
    });
    expectSafeListingMedia((await service.findOne("approved")).media);
  });

  it("hides non-approved database listings from public detail reads", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findOne("draft")).rejects.toThrow(NotFoundException);
  });

  it("does not expose a non-approved database listing by id", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "rejected", ownerId: "owner-1", status: "REJECTED" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findOne("rejected")).rejects.toThrow(NotFoundException);
  });

  it("creates draft listings even when a client sends review status data", async () => {
    const prisma = createPrismaMock();
    const service = new ListingsService(prisma as never, new AuditService());

    const listing = await service.create("owner-1", {
      ...listingDto(),
      status: "APPROVED"
    } as ListingDto);

    expect(listing.status).toBe("DRAFT");
    expect(prisma.listing.createCalls[0]?.data.status).toBe("DRAFT");
  });

  it("keeps the draft cover image server-controlled until media is published", async () => {
    const prisma = createPrismaMock();
    const service = new ListingsService(prisma as never, new AuditService());
    const dto = listingDto();

    await service.create("owner-1", dto as ListingDto);

    expect(prisma.listing.createCalls[0]?.data.image).toBeNull();
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
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.create("owner-1", listingDto())).rejects.toThrow(ForbiddenException);
    expect(prisma.listing.createCalls).toHaveLength(0);
  });

  it.each(["lister", "both"] as const)("allows a complete %s profile to create listings", async (role) => {
    const prisma = createPrismaMock({
      profiles: [publishProfile({ role })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.create("owner-1", listingDto())).resolves.toMatchObject({
      ownerId: "owner-1",
      status: "DRAFT"
    });
  });

  it("persists validated availability when an owner creates a listing", async () => {
    const prisma = createPrismaMock();
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(
      service.create(
        "owner-1",
        listingDto({
          availableFrom: "2026-09-01",
          availableTo: "2027-01-15"
        })
      )
    ).resolves.toMatchObject({
      availableFrom: new Date("2026-09-01T00:00:00.000Z"),
      availableTo: new Date("2027-01-15T00:00:00.000Z")
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
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findMine("owner-1")).resolves.toMatchObject([{ id: "newer" }, { id: "older" }]);
  });

  it("lists current-user listings with sorted media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "listing-1", sortOrder: 2, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "media-1", listingId: "listing-1", sortOrder: 1, storageStatus: "PUBLISHED" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findMine("owner-1")).resolves.toMatchObject([
      {
        id: "listing-1",
        media: [{ id: "media-1" }, { id: "media-2" }]
      }
    ]);
    expect(prisma.listing.findManyCalls[0]?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } }
    });
    expectSafeListingMedia((await service.findMine("owner-1"))[0]!.media);
  });

  it.each(["update", "submit"] as const)(
    "blocks %s for an owner whose publish profile is incomplete",
    async (operation) => {
      const prisma = createPrismaMock({
        listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
        profiles: [publishProfile({ school: null })]
      });
      const service = new ListingsService(prisma as never, new AuditService());

      const result = operation === "update"
        ? service.update("owner-1", "listing-1", { title: "Updated title" })
        : service.submit("owner-1", "listing-1");

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(prisma.listing.updateCalls).toHaveLength(0);
    }
  );

  it.each(["update", "submit"] as const)(
    "blocks %s for an owner whose complete profile is renter-only",
    async (operation) => {
      const prisma = createPrismaMock({
        listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })],
        profiles: [publishProfile({ role: "renter" })]
      });
      const service = new ListingsService(prisma as never, new AuditService());

      const result = operation === "update"
        ? service.update("owner-1", "listing-1", { title: "Updated title" })
        : service.submit("owner-1", "listing-1");

      await expect(result).rejects.toThrow(ForbiddenException);
      expect(prisma.listing.updateCalls).toHaveLength(0);
    }
  );

  it.each(["DRAFT", "REJECTED"] as const)("allows owners to update %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never, new AuditService());

    const updated = await service.update("owner-1", "listing-1", { title: "Updated title" });

    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe(status);
  });

  it("returns an approved listing to review after an availability-only edit", async () => {
    const prisma = createPrismaMock({
      listings: [
        listingRecord({
          id: "listing-1",
          ownerId: "owner-1",
          status: "APPROVED",
          reviewedAt: new Date("2026-08-10T00:00:00.000Z"),
          reviewerId: "admin-1"
        })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(
      service.update("owner-1", "listing-1", {
        availableFrom: "2026-09-01",
        availableTo: "2027-01-15"
      })
    ).resolves.toMatchObject({
      status: "SUBMITTED",
      availableFrom: new Date("2026-09-01T00:00:00.000Z"),
      availableTo: new Date("2027-01-15T00:00:00.000Z"),
      submittedAt: expect.any(Date),
      reviewedAt: null,
      reviewerId: null,
      rejectionReason: null
    });
  });

  it("keeps non-availability owner edits blocked for approved listings", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "APPROVED" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(
      service.update("owner-1", "listing-1", {
        title: "Changed title",
        availableFrom: "2026-09-01",
        availableTo: "2027-01-15"
      })
    ).rejects.toThrow(BadRequestException);
  });

  it("ignores client-provided review status when owners update listings", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    const updated = await service.update("owner-1", "listing-1", {
      title: "Updated title",
      status: "APPROVED"
    } as Partial<ListingDto>);

    expect(updated.title).toBe("Updated title");
    expect(updated.status).toBe("DRAFT");
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from updating %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.update("owner-1", "listing-1", { title: "Updated title" })).rejects.toThrow(BadRequestException);
  });

  it("returns not found when a non-owner updates a listing", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.update("owner-2", "listing-1", { title: "Updated title" })).rejects.toThrow(NotFoundException);
  });

  it("rejects empty direct service updates before calling Prisma", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

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
    const service = new ListingsService(prisma as never, new AuditService());

    const submitted = await service.submit("owner-1", "listing-1");

    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(submitted.reviewedAt).toBeNull();
    expect(submitted.reviewerId).toBeNull();
    expect(submitted.rejectionReason).toBeNull();
  });

  it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from submitting %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.submit("owner-1", "listing-1")).rejects.toThrow(BadRequestException);
  });

  it("returns not found when a non-owner submits a listing", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

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
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findReviewQueue()).resolves.toMatchObject([{ id: "older" }, { id: "newer" }]);
  });

  it("returns submitted listings for review with sorted media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "submitted", status: "SUBMITTED" })],
      media: [
        mediaRecord({ id: "media-2", listingId: "submitted", sortOrder: 2, storageStatus: "PUBLISHED" }),
        mediaRecord({ id: "media-1", listingId: "submitted", sortOrder: 1, storageStatus: "PUBLISHED" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findReviewQueue()).resolves.toMatchObject([
      {
        id: "submitted",
        media: [{ id: "media-1" }, { id: "media-2" }]
      }
    ]);
    expect(prisma.listing.findManyCalls[0]?.include).toEqual({
      media: { orderBy: { sortOrder: "asc" } }
    });
    expectSafeListingMedia((await service.findReviewQueue())[0]!.media);
  });

  it("gives administrators a protected preview path for ready review media", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: "submitted", status: "SUBMITTED" })],
      media: [mediaRecord({ id: "media-ready", listingId: "submitted", storageStatus: "READY" })]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.findReviewQueue()).resolves.toMatchObject([
      {
        id: "submitted",
        media: [
          {
            id: "media-ready",
            reviewContentUrl: "/api/v1/admin/listings/submitted/media/media-ready/content"
          }
        ]
      }
    ]);
  });

  it("approves and audits in the same transaction", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never, new AuditService());

    const approved = await service.approve(reviewListingId, auditActor, 0);

    expect(approved.status).toBe("APPROVED");
    expect(approved.reviewedAt).toBeInstanceOf(Date);
    expect(approved.reviewerId).toBe("admin-1");
    expect(approved.rejectionReason).toBeNull();
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      action: "LISTING_APPROVED",
      targetType: "Listing",
      targetId: reviewListingId,
      actorUserId: "admin-1",
      requestId: "request-1",
      outcome: "SUCCESS",
      metadata: { reason: "manual_review_approved", reviewedRevision: 0 }
    });
    expect(prisma.transactionCount).toBe(1);
  });

  it("publishes every ready image in the same approval transaction", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })],
      media: [
        mediaRecord({ id: "media-ready-1", listingId: reviewListingId, storageStatus: "READY" }),
        mediaRecord({ id: "media-ready-2", listingId: reviewListingId, storageStatus: "READY" })
      ]
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await service.approve(reviewListingId, auditActor, 0);

    expect(prisma.listingMedia.rows).toEqual([
      expect.objectContaining({ storageStatus: "PUBLISHED", reviewStatus: "APPROVED", publishedAt: expect.any(Date) }),
      expect.objectContaining({ storageStatus: "PUBLISHED", reviewStatus: "APPROVED", publishedAt: expect.any(Date) })
    ]);
  });

  it("rolls back approval when audit persistence fails", async () => {
    const prisma = createPrismaMock({
      listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })],
      failAuditCreate: true
    });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.approve(reviewListingId, auditActor, 0)).rejects.toThrow("audit create failed");

    expect(prisma.listing.rows[0].status).toBe("SUBMITTED");
    expect(prisma.auditEvent.rows).toHaveLength(0);
    expect(prisma.transactionCount).toBe(1);
  });

  it("rejects and audits the trimmed safe reason in the same transaction", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never, new AuditService());

    const rejected = await service.reject(reviewListingId, auditActor, "  Please add clearer bedroom photos  ", 0);

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.reviewedAt).toBeInstanceOf(Date);
    expect(rejected.reviewerId).toBe("admin-1");
    expect(rejected.rejectionReason).toBe("Please add clearer bedroom photos");
    expect(prisma.auditEvent.rows.at(-1)).toMatchObject({
      action: "LISTING_REJECTED",
      targetType: "Listing",
      targetId: reviewListingId,
      actorUserId: "admin-1",
      requestId: "request-1",
      outcome: "SUCCESS",
      metadata: { reason: "Please add clearer bedroom photos", reviewedRevision: 0 }
    });
    expect(prisma.transactionCount).toBe(1);
  });

  it("allows exactly one concurrent review decision", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never, new AuditService());

    const decisions = await Promise.allSettled([
      service.approve(reviewListingId, auditActor, 0),
      service.reject(reviewListingId, auditActor, "Please add clearer bedroom photos", 0)
    ]);

    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === "rejected")).toHaveLength(1);
    expect(["APPROVED", "REJECTED"]).toContain(prisma.listing.rows[0]?.status);
    expect(prisma.auditEvent.rows).toHaveLength(1);
    expect(prisma.auditEvent.rows[0]?.action).toBe(
      prisma.listing.rows[0]?.status === "APPROVED" ? "LISTING_APPROVED" : "LISTING_REJECTED"
    );
  });

  it("requires a non-empty rejection reason", async () => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: reviewListingId, status: "SUBMITTED" })] });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.reject(reviewListingId, auditActor, "   ", 0)).rejects.toThrow(BadRequestException);
  });

  it.each(["DRAFT", "APPROVED", "REJECTED"] as const)("blocks admin review for %s listings", async (status) => {
    const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status })] });
    const service = new ListingsService(prisma as never, new AuditService());

    await expect(service.approve("listing-1", auditActor, 0)).rejects.toThrow(BadRequestException);
    await expect(service.reject("listing-1", auditActor, "Reason", 0)).rejects.toThrow(BadRequestException);
  });
});

function listingDto(overrides: Partial<ListingDto> = {}): ListingDto {
  return {
    title: "Fenway verified sublet",
    area: "Boston - Fenway",
    availableFrom: "2026-08-20",
    availableTo: "2026-12-31",
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
    image: null,
    availableFrom: new Date(`${dto.availableFrom}T00:00:00.000Z`),
    availableTo: new Date(`${dto.availableTo}T00:00:00.000Z`),
    price: dto.price,
    originalPrice: dto.originalPrice,
    beds: dto.beds,
    baths: dto.baths,
    commute: dto.commute,
    transit: dto.transit,
    trust: dto.trust,
    tags: dto.tags,
    status: "DRAFT",
    revision: 0,
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
    url: "https://storage.example/listing-media/private.jpg",
    kind: "bedroom",
    sortOrder: 1,
    originalKey: "listing-media/listing-1/original",
    processedKey: "listing-media/listing-1/processed",
    publicMainKey: "listing-media/listing-1/public-main",
    publicThumbnailKey: "listing-media/listing-1/public-thumbnail",
    storageStatus: "READY",
    reviewStatus: "PENDING",
    publishedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function expectSafeListingMedia(media: Array<Record<string, unknown>>) {
  for (const item of media) {
    expect(item).not.toHaveProperty("url");
    expect(item).not.toHaveProperty("originalKey");
    expect(item).not.toHaveProperty("processedKey");
    expect(item).not.toHaveProperty("publicMainKey");
    expect(item).not.toHaveProperty("publicThumbnailKey");
    expect(item).toMatchObject({
      contentUrl: `/api/v1/listing-media/${item.id}/content`
    });
  }
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
  profiles = [publishProfile(), publishProfile({ email: "owner-2@example.com" })],
  failAuditCreate = false
}: {
  listings?: ListingRecord[];
  media?: ListingMediaRecord[];
  profiles?: PublishProfile[];
  failAuditCreate?: boolean;
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
      rows: records,
      createCalls: [] as ListingCreateArgs[],
      findManyCalls: [] as ListingFindManyArgs[],
      findUniqueCalls: [] as ListingFindUniqueArgs[],
      updateCalls: [] as ListingUpdateArgs[],
      updateManyCalls: [] as ListingUpdateManyArgs[],
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
      },
      updateMany: async (args: ListingUpdateManyArgs) => {
        mock.listing.updateManyCalls.push(args);
        const index = records.findIndex(
          (listing) => matchesWhere(listing, args.where)
        );
        if (index === -1) return { count: 0 };

        records[index] = {
          ...records[index],
          ...args.data,
          revision: typeof args.data.revision === "object"
            ? records[index].revision + args.data.revision.increment
            : args.data.revision ?? records[index].revision,
          updatedAt: args.data.updatedAt ?? new Date()
        };
        return { count: 1 };
      }
    },
    listingMedia: {
      rows: mediaRecords,
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
      },
      updateMany: async (args: ListingMediaUpdateManyArgs) => {
        const matched = mediaRecords.filter(
          (record) => record.listingId === args.where.listingId && record.storageStatus === args.where.storageStatus
        );
        matched.forEach((record) => Object.assign(record, args.data));
        return { count: matched.length };
      }
    },
    auditEvent: {
      rows: [] as Array<Record<string, unknown>>,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        if (failAuditCreate) throw new Error("audit create failed");
        const row = { id: `audit-${mock.auditEvent.rows.length + 1}`, ...data };
        mock.auditEvent.rows.push(row);
        return row;
      }
    }
  };

  let transactionTail = Promise.resolve();
  const mockWithTransaction = Object.assign(mock, {
    transactionCount: 0,
    $transaction: async <T>(operation: (transaction: typeof mock) => Promise<T>) => {
      mockWithTransaction.transactionCount += 1;
      const previousTransaction = transactionTail;
      let releaseTransaction!: () => void;
      transactionTail = new Promise<void>((resolve) => {
        releaseTransaction = resolve;
      });
      await previousTransaction;
      const listingSnapshot = records.map((record) => ({ ...record }));
      const mediaSnapshot = mediaRecords.map((record) => ({ ...record }));
      const auditSnapshot = mock.auditEvent.rows.map((record) => ({ ...record }));
      try {
        return await operation(mock);
      } catch (error) {
        records.splice(0, records.length, ...listingSnapshot);
        mediaRecords.splice(0, mediaRecords.length, ...mediaSnapshot);
        mock.auditEvent.rows.splice(0, mock.auditEvent.rows.length, ...auditSnapshot);
        throw error;
      } finally {
        releaseTransaction();
      }
    }
  });

  return mockWithTransaction;
}

function matchesWhere(listing: ListingRecord, where: ListingWhere = {}) {
  if (where.id && listing.id !== where.id) return false;
  if (where.ownerId && listing.ownerId !== where.ownerId) return false;
  if (where.status && listing.status !== where.status) return false;
  if (where.revision !== undefined && listing.revision !== where.revision) return false;
  if (where.availableFrom?.lte && listing.availableFrom > where.availableFrom.lte) return false;
  if (where.availableTo?.gte && listing.availableTo < where.availableTo.gte) return false;
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
    .filter((item) =>
      item.listingId === listing.id &&
      (!include.media?.where?.storageStatus || item.storageStatus === include.media.where.storageStatus)
    )
    .sort((first, second) =>
      include.media?.orderBy?.sortOrder === "desc" ? second.sortOrder - first.sortOrder : first.sortOrder - second.sortOrder
    );

  return {
    ...listing,
    media: sortedMedia
  };
}
