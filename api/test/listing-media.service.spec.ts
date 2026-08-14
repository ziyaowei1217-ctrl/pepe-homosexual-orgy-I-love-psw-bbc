import { createHash } from "node:crypto";

import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

import { MAX_LISTING_MEDIA_BYTES } from "../src/listing-media/listing-media.constants";
import { ListingMediaService } from "../src/listing-media/listing-media.service";
import type { ListingMediaStorage } from "../src/listing-media/listing-media-storage";

type ListingStatus = "DRAFT" | "REJECTED" | "SUBMITTED" | "APPROVED";
type StorageStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED_PENDING_VALIDATION"
  | "READY"
  | "PUBLISHED"
  | "FAILED";

type ListingRow = {
  id: string;
  ownerId: string;
  status: ListingStatus;
};

type MediaRow = {
  id: string;
  listingId: string;
  url: string | null;
  kind: string;
  sortOrder: number;
  originalKey: string | null;
  processedKey: string | null;
  publicMainKey: string | null;
  publicThumbnailKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  checksum: string | null;
  uploadExpiresAt: Date | null;
  storageStatus: StorageStatus;
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  securityErrorCode: string | null;
  finalizedAt: Date | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

describe("ListingMediaService", () => {
  it("initializes an owner upload with a server key and the next sort position", async () => {
    const database = createDatabase({ media: [mediaRow({ id: "existing", sortOrder: 0 })] });
    const storage = createStorage();
    const service = createService(database, storage);

    await expect(service.initializeUpload("owner-1", "listing-1", uploadInput())).resolves.toMatchObject({
      media: {
        listingId: "listing-1",
        kind: "卧室",
        sortOrder: 1,
        storageStatus: "PENDING_UPLOAD",
        securityErrorCode: null
      },
      uploadUrl: "http://localhost:9000/signed",
      expiresAt: new Date("2026-08-14T05:10:00.000Z")
    });

    expect(database.media[1]?.originalKey).toBe("listing-media/listing-1/object-1");
    expect(database.media[1]?.originalKey).not.toContain("bedroom.png");
    expect(storage.createUploadUrl).toHaveBeenCalledWith(
      "listing-media/listing-1/object-1",
      "image/png",
      128
    );
  });

  it("enforces the 12-item limit without creating another media row", async () => {
    const database = createDatabase({
      media: Array.from({ length: 12 }, (_, index) => mediaRow({ id: `media-${index}`, sortOrder: index }))
    });
    const service = createService(database, createStorage());

    await expect(service.initializeUpload("owner-1", "listing-1", uploadInput())).rejects.toMatchObject({
      response: expect.objectContaining({ code: "LISTING_MEDIA_LIMIT_REACHED" })
    });
    expect(database.media).toHaveLength(12);
  });

  it.each([
    ["another owner", "owner-2", "DRAFT", NotFoundException],
    ["submitted listing", "owner-1", "SUBMITTED", ConflictException],
    ["approved listing", "owner-1", "APPROVED", ConflictException]
  ] as const)("blocks initialization for %s", async (_label, ownerId, status, errorType) => {
    const database = createDatabase({ listings: [listingRow({ status })] });
    const service = createService(database, createStorage());

    await expect(service.initializeUpload(ownerId, "listing-1", uploadInput())).rejects.toBeInstanceOf(errorType);
  });

  it("moves an uploaded object through pending validation into READY with server metadata", async () => {
    const bytes = await pngBytes();
    const database = createDatabase({
      media: [
        mediaRow({
          originalKey: "listing-media/listing-1/object-1",
          mimeType: "image/png",
          sizeBytes: bytes.length,
          checksum: sha256(bytes)
        })
      ]
    });
    const storage = createStorage(bytes);
    const service = createService(database, storage);

    await expect(service.finalize("owner-1", "listing-1", "media-1")).resolves.toMatchObject({
      storageStatus: "READY",
      mimeType: "image/png",
      sizeBytes: bytes.length,
      width: 2,
      height: 3,
      checksum: sha256(bytes),
      securityErrorCode: null,
      finalizedAt: new Date("2026-08-14T05:00:00.000Z")
    });
    expect(database.statusHistory).toEqual([
      "UPLOADED_PENDING_VALIDATION",
      "READY"
    ]);
  });

  it("records a stable security code when stored bytes fail validation", async () => {
    const bytes = Buffer.from("not an image", "utf8");
    const database = createDatabase({
      media: [
        mediaRow({
          originalKey: "listing-media/listing-1/object-1",
          mimeType: "image/png",
          sizeBytes: bytes.length,
          checksum: sha256(bytes)
        })
      ]
    });
    const service = createService(database, createStorage(bytes));

    await expect(service.finalize("owner-1", "listing-1", "media-1")).resolves.toMatchObject({
      storageStatus: "FAILED",
      securityErrorCode: "IMAGE_TYPE_UNSUPPORTED"
    });
    expect(database.statusHistory).toEqual([
      "UPLOADED_PENDING_VALIDATION",
      "FAILED"
    ]);
  });

  it("records a stable failure when required upload metadata is missing", async () => {
    const database = createDatabase({ media: [mediaRow({ checksum: null })] });
    const service = createService(database, createStorage());

    await expect(service.finalize("owner-1", "listing-1", "media-1")).resolves.toMatchObject({
      storageStatus: "FAILED",
      securityErrorCode: "IMAGE_VALIDATION_FAILED"
    });
  });

  it("does not finalize the same upload twice", async () => {
    const database = createDatabase({ media: [mediaRow({ storageStatus: "READY" })] });
    const service = createService(database, createStorage());

    await expect(service.finalize("owner-1", "listing-1", "media-1")).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("retries a failed item on the same row with a new server key", async () => {
    const database = createDatabase({
      media: [
        mediaRow({
          storageStatus: "FAILED",
          originalKey: "listing-media/listing-1/old-object",
          securityErrorCode: "IMAGE_CHECKSUM_MISMATCH",
          width: 10,
          height: 10,
          finalizedAt: new Date("2026-08-14T04:00:00.000Z")
        })
      ]
    });
    const storage = createStorage();
    const service = createService(database, storage);

    await expect(service.retry("owner-1", "listing-1", "media-1")).resolves.toMatchObject({
      media: {
        id: "media-1",
        originalKey: "listing-media/listing-1/object-1",
        storageStatus: "PENDING_UPLOAD",
        securityErrorCode: null,
        width: null,
        height: null,
        finalizedAt: null
      },
      uploadUrl: "http://localhost:9000/signed"
    });
    expect(storage.delete).toHaveBeenCalledWith("listing-media/listing-1/old-object");
  });

  it("reorders every media id atomically and makes the first id the cover", async () => {
    const database = createDatabase({
      media: [
        mediaRow({ id: "media-1", sortOrder: 0 }),
        mediaRow({ id: "media-2", sortOrder: 1 }),
        mediaRow({ id: "media-3", sortOrder: 2 })
      ]
    });
    const service = createService(database, createStorage());

    await expect(
      service.reorder("owner-1", "listing-1", { mediaIds: ["media-3", "media-1", "media-2"] })
    ).resolves.toMatchObject([
      { id: "media-3", sortOrder: 0 },
      { id: "media-1", sortOrder: 1 },
      { id: "media-2", sortOrder: 2 }
    ]);
  });

  it.each([
    [["media-1", "media-1"], "duplicate ids"],
    [["media-1"], "an incomplete set"],
    [["media-1", "foreign"], "a foreign id"]
  ])("rejects reorder with %s", async (mediaIds) => {
    const database = createDatabase({
      media: [mediaRow({ id: "media-1" }), mediaRow({ id: "media-2", sortOrder: 1 })]
    });
    const service = createService(database, createStorage());

    await expect(service.reorder("owner-1", "listing-1", { mediaIds })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("removes editable media and its private object", async () => {
    const database = createDatabase({
      media: [mediaRow({ originalKey: "listing-media/listing-1/object-1" })]
    });
    const storage = createStorage();
    const service = createService(database, storage);

    await expect(service.remove("owner-1", "listing-1", "media-1")).resolves.toEqual({
      removed: true
    });
    expect(database.media).toEqual([]);
    expect(storage.delete).toHaveBeenCalledWith("listing-media/listing-1/object-1");
  });

  it("lists only an owner's media in cover order", async () => {
    const database = createDatabase({
      media: [mediaRow({ id: "media-2", sortOrder: 2 }), mediaRow({ id: "media-1", sortOrder: 1 })]
    });
    const service = createService(database, createStorage());

    await expect(service.findOwned("owner-1", "listing-1")).resolves.toMatchObject([
      { id: "media-1" },
      { id: "media-2" }
    ]);
    await expect(service.findOwned("owner-2", "listing-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects invalid service input even when HTTP validation is bypassed", async () => {
    const database = createDatabase();
    const service = createService(database, createStorage());

    await expect(
      service.initializeUpload("owner-1", "listing-1", {
        ...uploadInput(),
        sizeBytes: MAX_LISTING_MEDIA_BYTES + 1
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.initializeUpload("owner-1", "listing-1", {
        ...uploadInput(),
        checksumSha256: "unsafe"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function createService(database: ReturnType<typeof createDatabase>, storage: ReturnType<typeof createStorage>) {
  let objectSequence = 0;
  return new ListingMediaService(
    database.prisma as never,
    storage as never,
    () => new Date("2026-08-14T05:00:00.000Z"),
    () => `object-${++objectSequence}`
  );
}

function uploadInput() {
  return {
    kind: "卧室",
    mimeType: "image/png" as const,
    sizeBytes: 128,
    checksumSha256: "a".repeat(64)
  };
}

function listingRow(overrides: Partial<ListingRow> = {}): ListingRow {
  return { id: "listing-1", ownerId: "owner-1", status: "DRAFT", ...overrides };
}

function mediaRow(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: "media-1",
    listingId: "listing-1",
    url: null,
    kind: "卧室",
    sortOrder: 0,
    originalKey: "listing-media/listing-1/object-original",
    processedKey: null,
    publicMainKey: null,
    publicThumbnailKey: null,
    mimeType: "image/png",
    sizeBytes: 128,
    width: null,
    height: null,
    checksum: "a".repeat(64),
    uploadExpiresAt: new Date("2026-08-14T05:10:00.000Z"),
    storageStatus: "PENDING_UPLOAD",
    reviewStatus: "PENDING",
    securityErrorCode: null,
    finalizedAt: null,
    publishedAt: null,
    createdAt: new Date("2026-08-14T05:00:00.000Z"),
    updatedAt: new Date("2026-08-14T05:00:00.000Z"),
    ...overrides
  };
}

function createDatabase({
  listings = [listingRow()],
  media = []
}: {
  listings?: ListingRow[];
  media?: MediaRow[];
} = {}) {
  const listingRows = listings.map((row) => ({ ...row }));
  const mediaRows = media.map((row) => ({ ...row }));
  const statusHistory: StorageStatus[] = [];

  const prisma = {
    listing: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        listingRows.find((row) => row.id === where.id) ?? null
    },
    listingMedia: {
      count: async ({ where }: { where: { listingId: string } }) =>
        mediaRows.filter((row) => row.listingId === where.listingId).length,
      findUnique: async ({ where }: { where: { id: string } }) =>
        mediaRows.find((row) => row.id === where.id) ?? null,
      findMany: async ({
        where,
        orderBy
      }: {
        where: { listingId: string };
        orderBy?: { sortOrder: "asc" | "desc" };
      }) => {
        const found = mediaRows.filter((row) => row.listingId === where.listingId);
        return [...found].sort((left, right) =>
          orderBy?.sortOrder === "desc" ? right.sortOrder - left.sortOrder : left.sortOrder - right.sortOrder
        );
      },
      create: async ({ data }: { data: Partial<MediaRow> & Pick<MediaRow, "listingId" | "kind"> }) => {
        const created = mediaRow({ id: `media-${mediaRows.length + 1}`, ...data });
        mediaRows.push(created);
        return created;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MediaRow> }) => {
        const index = mediaRows.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("missing media");
        mediaRows[index] = { ...mediaRows[index]!, ...data };
        return mediaRows[index]!;
      },
      updateMany: async ({
        where,
        data
      }: {
        where: { id: string; storageStatus?: StorageStatus };
        data: Partial<MediaRow>;
      }) => {
        const index = mediaRows.findIndex(
          (row) =>
            row.id === where.id &&
            (!where.storageStatus || row.storageStatus === where.storageStatus)
        );
        if (index < 0) return { count: 0 };
        mediaRows[index] = { ...mediaRows[index]!, ...data };
        if (data.storageStatus) statusHistory.push(data.storageStatus);
        return { count: 1 };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = mediaRows.findIndex((row) => row.id === where.id);
        if (index < 0) throw new Error("missing media");
        return mediaRows.splice(index, 1)[0]!;
      }
    }
  };

  return {
    media: mediaRows,
    statusHistory,
    prisma: Object.assign(prisma, {
      $transaction: async <T>(operation: (transaction: typeof prisma) => Promise<T>) => operation(prisma)
    })
  };
}

function createStorage(bytes: Buffer<ArrayBufferLike> = Buffer.from("stored")) {
  return {
    createUploadUrl: vi.fn(async () => ({
      uploadUrl: "http://localhost:9000/signed",
      expiresAt: new Date("2026-08-14T05:10:00.000Z")
    })),
    read: vi.fn(async () => bytes),
    delete: vi.fn(async () => undefined)
  } satisfies ListingMediaStorage;
}

async function pngBytes() {
  return sharp({
    create: {
      width: 2,
      height: 3,
      channels: 4,
      background: { r: 42, g: 96, b: 160, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
