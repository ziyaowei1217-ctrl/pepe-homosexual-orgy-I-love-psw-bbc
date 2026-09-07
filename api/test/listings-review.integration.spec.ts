import { listingMediaUploadAttemptId } from "../src/listing-media/listing-media.presentation";
import { createHash, randomUUID } from "node:crypto";

import { BadRequestException, ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService, type AuditActor } from "../src/audit/audit.service";
import { ListingMediaService } from "../src/listing-media/listing-media.service";
import { ListingsService } from "../src/listings/listings.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres("listing_review_concurrency");

describeDatabase("listing review PostgreSQL concurrency", () => {
  let firstClient: PrismaClient | undefined;
  let secondClient: PrismaClient | undefined;
  let firstService: ListingsService;
  let secondService: ListingsService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    firstClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    secondClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
    firstService = new ListingsService(firstClient as never, new AuditService());
    secondService = new ListingsService(secondClient as never, new AuditService());
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([firstClient?.$disconnect(), secondClient?.$disconnect()]);
    database.drop();
  });

  it.each(["update", "submit"] as const)("rejects a stale draft %s after submission and approval", async (operation) => {
    const listing = await createDraft(firstClient!, `stale-${operation}`);
    const paused = pauseFirstListingRead(firstClient!);
    const delayedService = new ListingsService(paused.client as never, new AuditService());
    const pending = Promise.allSettled([operation === "update"
      ? delayedService.update(listing.ownerId, listing.id, { title: "Unreviewed replacement", price: 9000 })
      : delayedService.submit(listing.ownerId, listing.id)]);
    await paused.read;
    try {
      const submitted = await secondService.submit(listing.ownerId, listing.id);
      await secondService.approve(listing.id, actor("reviewer", "reviewer@example.test"), submitted.revision);
    } finally {
      paused.release();
    }
    expect(await pending).toMatchObject([{ status: "rejected", reason: expect.any(ConflictException) }]);
    expect(await firstService.findOne(listing.id)).toMatchObject({
      status: "APPROVED", title: "Reviewed original", price: 1800
    });
    expect(await firstClient!.auditEvent.count({ where: { targetId: listing.id } })).toBe(1);
  });

  it("rejects a stale partial date edit even when the listing remains DRAFT", async () => {
    const listing = await createDraft(firstClient!, "stale-date-edit");
    const paused = pauseFirstListingRead(firstClient!);
    const delayedService = new ListingsService(paused.client as never, new AuditService());
    const pending = Promise.allSettled([
      delayedService.update(listing.ownerId, listing.id, { availableFrom: "2099-08-01" })
    ]);
    await paused.read;
    try {
      await secondService.update(listing.ownerId, listing.id, { availableTo: "2099-06-01" });
    } finally {
      paused.release();
    }
    expect(await pending).toMatchObject([{ status: "rejected", reason: expect.any(ConflictException) }]);
    expect(await firstClient!.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-06-01"), status: "DRAFT"
    });
  });

  it.each(["approve", "reject"] as const)("rejects a stale %s snapshot after content is edited and resubmitted", async (decision) => {
    const listing = await createDraft(firstClient!, `stale-review-${decision}`);
    const submitted = await firstService.submit(listing.ownerId, listing.id);
    const reviewActor = actor("reviewer", "reviewer@example.test");
    await secondService.reject(listing.id, reviewActor, "Needs changes", submitted.revision);
    await secondService.update(listing.ownerId, listing.id, { title: "Replacement title", price: 9000 });
    const resubmitted = await secondService.submit(listing.ownerId, listing.id);
    const staleReview = decision === "approve"
      ? firstService.approve(listing.id, reviewActor, submitted.revision)
      : firstService.reject(listing.id, reviewActor, "Stale rejection", submitted.revision);
    await expect(staleReview).rejects.toThrow(ConflictException);
    expect(await firstClient!.listing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({
      status: "SUBMITTED", title: "Replacement title", price: 9000, revision: resubmitted.revision
    });
    expect(await firstClient!.auditEvent.count({ where: { targetId: listing.id } })).toBe(1);
  });

  it("prevents a stale media removal from deleting an approved photo", async () => {
    const listing = await createDraft(firstClient!, "stale-media-removal");
    const media = await firstClient!.listingMedia.create({ data: {
      listingId: listing.id, kind: "bedroom", storageStatus: "READY", originalKey: "test-photo"
    } });
    const deletedKeys: string[] = [];
    const paused = pauseFirstListingRead(firstClient!);
    const mediaService = new ListingMediaService(paused.client as never, {
      write: async () => undefined,
      createUploadUrl: async () => ({ uploadUrl: "https://example.test", expiresAt: new Date() }),
      read: async () => Buffer.from("test"),
      delete: async (key: string) => { deletedKeys.push(key); }
    });
    const pending = Promise.allSettled([mediaService.remove(listing.ownerId, listing.id, media.id)]);
    await paused.read;
    try {
      const submitted = await secondService.submit(listing.ownerId, listing.id);
      await secondService.approve(listing.id, actor("reviewer", "reviewer@example.test"), submitted.revision);
    } finally {
      paused.release();
    }
    expect(await pending).toMatchObject([{ status: "rejected", reason: expect.any(ConflictException) }]);
    expect(await firstClient!.listingMedia.findUnique({ where: { id: media.id } })).toMatchObject({ storageStatus: "PUBLISHED" });
    expect(deletedKeys).toEqual([]);
  });

  it("prevents an in-flight media validation from adding content after review", async () => {
    const listing = await createDraft(firstClient!, "stale-media-finalize");
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const { createHash } = await import("node:crypto");
    const media = await firstClient!.listingMedia.create({ data: {
      listingId: listing.id, kind: "bedroom", originalKey: "test-photo", mimeType: "image/png",
      sizeBytes: bytes.length, checksum: createHash("sha256").update(bytes).digest("hex")
    } });
    let release!: () => void;
    let onRead!: () => void;
    const read = new Promise<void>((resolve) => { onRead = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    const mediaService = new ListingMediaService(firstClient as never, {
      write: async () => undefined,
      createUploadUrl: async () => ({ uploadUrl: "https://example.test", expiresAt: new Date() }),
      read: async () => { onRead(); await released; return bytes; },
      delete: async () => undefined
    });
    const pending = Promise.allSettled([mediaService.finalize(listing.ownerId, listing.id, media.id, listingMediaUploadAttemptId(media.originalKey)!)]);
    await read;
    try {
      const submitted = await secondService.submit(listing.ownerId, listing.id);
      await secondService.approve(listing.id, actor("reviewer", "reviewer@example.test"), submitted.revision);
    } finally {
      release();
    }
    expect(await pending).toMatchObject([{ status: "rejected", reason: expect.any(ConflictException) }]);
    expect(await firstClient!.listingMedia.findUnique({ where: { id: media.id } })).toMatchObject({
      storageStatus: "UPLOADED_PENDING_VALIDATION"
    });
  });

  it("initializes three independent photos concurrently with distinct sort positions", async () => {
    const listing = await createDraft(firstClient!, "concurrent-media-initialize");
    const client = synchronizeListingUpdates(firstClient!, 3, () => true, true);
    const service = new ListingMediaService(client as never, {
      write: async () => undefined,
      createUploadUrl: async () => ({ uploadUrl: "https://example.test", expiresAt: new Date() }),
      read: async () => Buffer.from("unused"),
      delete: async () => undefined
    });

    const initialized = await Promise.allSettled(Array.from({ length: 3 }, (_, index) =>
      service.initializeUpload(listing.ownerId, listing.id, {
        commandId: randomUUID(),
        kind: `photo-${index}`, mimeType: "image/png", sizeBytes: 100, checksumSha256: "a".repeat(64)
      })
    ));

    expect(initialized.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const media = await firstClient!.listingMedia.findMany({ where: { listingId: listing.id }, orderBy: { sortOrder: "asc" } });
    expect(media.map((item) => item.sortOrder)).toEqual([0, 1, 2]);
    expect(media.map((item) => item.storageStatus)).toEqual(["PENDING_UPLOAD", "PENDING_UPLOAD", "PENDING_UPLOAD"]);
    expect((await firstClient!.listing.findUniqueOrThrow({ where: { id: listing.id } })).revision).toBe(3);
  });

  it("completes three independent photo validations without leaving an image stuck", async () => {
    const listing = await createDraft(firstClient!, "concurrent-media-finalize");
    const sharp = (await import("sharp")).default;
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "red" } }).png().toBuffer();
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const media = await Promise.all(Array.from({ length: 3 }, (_, index) => firstClient!.listingMedia.create({ data: {
      listingId: listing.id, kind: `photo-${index}`, originalKey: `test-photo-${index}`, mimeType: "image/png",
      sizeBytes: bytes.length, checksum, sortOrder: index
    } })));
    let completing = false;
    let releaseValidation!: () => void;
    const validationReleased = new Promise<void>((resolve) => { releaseValidation = resolve; });
    const storageReads = media.map(() => deferred());
    const client = synchronizeListingUpdates(firstClient!, 3, () => completing);
    const service = new ListingMediaService(client as never, {
      write: async () => undefined,
      createUploadUrl: async () => ({ uploadUrl: "https://example.test", expiresAt: new Date() }),
      read: async (key) => {
        storageReads[media.findIndex((item) => item.originalKey === key)].resolve();
        await validationReleased;
        return bytes;
      },
      delete: async () => undefined
    });
    const completions: Array<Promise<PromiseSettledResult<unknown>[]>> = [];
    // Commit each start before allowing any validation to finish. All completion
    // transactions then reach the listing update with the same observed revision.
    for (const [index, item] of media.entries()) {
      completions.push(Promise.allSettled([service.finalize(listing.ownerId, listing.id, item.id, listingMediaUploadAttemptId(item.originalKey)!)]));
      await storageReads[index].promise;
    }
    completing = true;
    releaseValidation();

    const outcomes = (await Promise.all(completions)).flat();
    expect(outcomes.map((result) => result.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const finalized = await firstClient!.listingMedia.findMany({ where: { listingId: listing.id }, orderBy: { sortOrder: "asc" } });
    expect(finalized.map((item) => item.storageStatus)).toEqual(["READY", "READY", "READY"]);
    expect((await firstClient!.listing.findUniqueOrThrow({ where: { id: listing.id } })).revision).toBe(6);
  });

  it("allows exactly one concurrent approve/reject decision and one success audit", async () => {
    if (!firstClient) throw new Error("test database was not initialized");
    const owner = await firstClient.user.create({ data: { email: "listing-owner@example.com" } });
    const listing = await firstClient.listing.create({
      data: {
        ownerId: owner.id,
        title: "Concurrent review listing",
        area: "Boston",
        availableFrom: new Date("2026-08-20T00:00:00.000Z"),
        availableTo: new Date("2026-12-31T00:00:00.000Z"),
        price: 1_900,
        originalPrice: 2_100,
        beds: 1,
        baths: 1,
        commute: "10 minutes",
        transit: "Green Line",
        trust: "Verified",
        tags: ["review"],
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    });
    const firstActor = actor("first-admin", "first-admin@example.com");
    const secondActor = actor("second-admin", "second-admin@example.com");

    const decisions = await Promise.allSettled([
      firstService.approve(listing.id, firstActor, listing.revision),
      secondService.reject(listing.id, secondActor, "Please add clearer bedroom photos", listing.revision)
    ]);

    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    const rejected = decisions.find((decision) => decision.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(BadRequestException) });
    const finalListing = await firstClient.listing.findUniqueOrThrow({ where: { id: listing.id } });
    const audits = await firstClient.auditEvent.findMany({
      where: { targetType: "Listing", targetId: listing.id }
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe(finalListing.status === "APPROVED" ? "LISTING_APPROVED" : "LISTING_REJECTED");
  });
});

function actor(actorUserId: string, actorEmail: string): AuditActor {
  return { actorType: "USER", actorUserId, actorEmail, requestId: `request-${actorUserId}` };
}

async function createDraft(client: PrismaClient, suffix: string) {
  const owner = await client.user.create({ data: { email: `${suffix}@example.test` } });
  await client.profile.create({ data: {
    email: owner.email, displayName: "Test owner", role: "lister", school: "Test school", city: "Los Angeles"
  } });
  return client.listing.create({ data: {
    ownerId: owner.id, title: "Reviewed original", area: "Westwood", status: "DRAFT",
    availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31"),
    price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: "Bus", transit: "Bus", trust: "Pending", tags: []
  } });
}

function pauseFirstListingRead(client: PrismaClient) {
  let onRead!: () => void;
  let release!: () => void;
  const read = new Promise<void>((resolve) => { onRead = resolve; });
  const released = new Promise<void>((resolve) => { release = resolve; });
  let paused = false;
  const listing = new Proxy(client.listing, { get(target, key) {
    if (key === "findUnique") return async (args: Parameters<typeof target.findUnique>[0]) => {
      const record = await target.findUnique(args);
      if (!paused) { paused = true; onRead(); await released; }
      return record;
    };
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { read, release, client: new Proxy(client, { get(target, key) {
    if (key === "listing") return listing;
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } }) };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function synchronizeListingUpdates(client: PrismaClient, participants: number, enabled = () => true, beforeTransactionWork = false) {
  let arrived = 0;
  const barrier = deferred();
  return new Proxy(client, { get(target, key) {
    if (key === "$transaction") return (operation: (transaction: unknown) => Promise<unknown>, options?: object) =>
      target.$transaction(async (transaction) => {
        // Initialization now locks before its revision update; rendezvous before
        // that first lock rather than holding it while waiting for other callers.
        if (beforeTransactionWork) {
          arrived += 1;
          if (arrived === participants) barrier.resolve();
          await barrier.promise;
        }
        const listing = new Proxy(transaction.listing, { get(delegate, method) {
          if (method === "updateMany") return async (args: Parameters<typeof delegate.updateMany>[0]) => {
            if (enabled() && !beforeTransactionWork) {
              arrived += 1;
              if (arrived === participants) barrier.resolve();
              await barrier.promise;
            }
            return delegate.updateMany(args);
          };
          const value = Reflect.get(delegate, method);
          return typeof value === "function" ? value.bind(delegate) : value;
        } });
        return operation(new Proxy(transaction, { get(inner, property) {
          if (property === "listing") return listing;
          const value = Reflect.get(inner, property);
          return typeof value === "function" ? value.bind(inner) : value;
        } }));
      }, options);
    const value = Reflect.get(target, key);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
