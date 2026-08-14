# MinIO Listing Media Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace host-supplied image URLs with a persistent MinIO upload lifecycle that survives refresh, enforces server-side object verification, publishes media atomically with listing approval, and delivers approved bytes through the API.

**Architecture:** A focused `ListingMediaService` owns media authorization, storage state transitions, ordering, cover selection, deletion, submission requirements, and content access. An `ObjectStorage` port isolates MinIO from business logic; internal object operations use the official MinIO Node SDK, while an S3 SigV4 presigner signs the externally reachable PUT URL and requires the declared `Content-Type`. The frontend creates the listing draft before entering the media step, then a standalone uploader treats the owner media endpoint as authoritative and uses local `File`/Blob URLs only for transient preview and retry state.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7, NestJS 10, Prisma 6, PostgreSQL 16, MinIO/S3 SigV4, Node streams/crypto, XMLHttpRequest, Vitest, Supertest, Docker Compose.

## Global Constraints

- Accepted MIME types are exactly `image/jpeg`, `image/png`, and `image/webp`.
- Maximum verified size is `10 * 1024 * 1024` bytes per image, inclusive; empty objects are invalid.
- Maximum current media count is 12 rows per listing.
- Upload PUT URLs expire after exactly 10 minutes (`600` seconds).
- Browser uploads run with at most 3 concurrent files.
- Object keys are `listings/<listingId>/<random UUID>.<type-derived extension>` and never contain a filename or user-controlled path segment.
- `storageStatus` remains the existing `PENDING | READY | PUBLISHED | FAILED` state machine; do not add intermediate states.
- Editable media states are listing `DRAFT` and `REJECTED`; `SUBMITTED` and `APPROVED` media are locked.
- Submission requires at least one MinIO-backed `READY` row, no `PENDING`/`FAILED` rows, and a cover belonging to the ordered `READY` set.
- Rejection preserves `READY` media with `reviewStatus=PENDING`; approval changes ordered `READY` rows to `PUBLISHED` and `APPROVED` in the same transaction as listing approval.
- New create/update DTOs reject `image`; new drafts store `image: ""`. Approved legacy listings without `coverMediaId` continue to return their stored `Listing.image`.
- Environment-specific delivery URLs are derived from `PUBLIC_API_BASE_URL` and are never stored in PostgreSQL.
- Owner/admin/public representations must never expose `originalKey`, processed/public keys, MinIO endpoints, bucket names, credentials, presigned signatures, caught SDK errors, or database messages.
- Public bytes are served only from `GET /listing-media/:mediaId/content`; the API never redirects to MinIO.
- No thumbnails, resizing, compression, conversion, image dimensions, EXIF work, malware scanning, automated moderation, CDN work, remote URL import, or scheduled orphan cleanup is added.
- Preserve approved URL-backed seed listings and all unrelated working-tree changes.

## Resolved Implementation Decisions

- Reorder the wizard to `基础信息 → 价格与设施 → 图片与分类 → 预览与提交`. The listing DTO requires pricing/tags, so this guarantees a valid server draft exists before any presigned upload is initialized and avoids placeholder listing data.
- The public MinIO JavaScript `presignedPutObject()` API signs only `host`. Use `@aws-sdk/client-s3` plus `@aws-sdk/s3-request-presigner` with `signableHeaders: new Set(["content-type"])` for the PUT URL; use the official `minio` package for internal `statObject`, `getObject`, and `removeObject` operations.
- There is no retry HTTP endpoint. In-session retry retains the local `File`, deletes the stale `PENDING`/`FAILED` row through the ordinary delete command, and initializes a fresh upload. After refresh, rows without a local `File` show `重新选择文件`.
- Finalize marks `FAILED` conditionally before deleting an invalid object. It deletes only when its `PENDING → FAILED` update wins, preventing a losing finalize request from deleting an object another request has already made `READY`.
- Deletion removes the object before deleting the database row. Missing objects count as success; if the database step fails, retry sees an absent object and completes row cleanup.

---

## File Responsibility Map

- `api/prisma/schema.prisma` and `api/prisma/migrations/20260814133000_listing_media_cover/migration.sql`: nullable canonical cover relation with `ON DELETE SET NULL`.
- `api/src/listing-media/object-storage.ts`: storage port, injection token, normalized storage errors, and bounded-operation contract.
- `api/src/listing-media/object-storage.config.ts`: strict endpoint/credential/bucket/public-URL parsing.
- `api/src/listing-media/minio-object-storage.ts`: internal MinIO operations and externally addressed, content-type-bound PUT presigning.
- `api/src/listing-media/media-file-validation.ts`: bounded streaming, SHA-256, byte count, and JPEG/PNG/WebP signature validation.
- `api/src/listing-media/listing-media.errors.ts`: stable status/code/Chinese-message factory.
- `api/src/listing-media/dto.ts`: initialize and complete-order request DTOs.
- `api/src/listing-media/listing-media.presenter.ts`: safe owner/admin/public media projections and API content URLs.
- `api/src/listing-media/listing-media.service.ts`: media state machine, ownership, listing-state checks, concurrency, ordering, cover, deletion, lifecycle hooks, and content authorization.
- `api/src/listing-media/listing-media.controller.ts`: owned media commands and private/public streaming controller.
- `api/src/listing-media/listing-media.module.ts`: provider wiring and service export.
- `api/test/support/fake-object-storage.ts`: deterministic object storage for unit and HTTP tests.
- `lib/listing-media.ts`: frontend API contracts, authenticated Blob reads, XHR PUT, queue/recovery state, and three-upload scheduler.
- `components/listing-media-uploader.tsx`: selection/drop UI, previews, progress, retry/reselect, category, order, cover, and deletion.
- `lib/publish-listing.ts`: listing-only draft mapping and media-summary gates.
- `components/sublet-app.tsx`: wizard orchestration and server-draft handoff.
- `docker/minio/cors.xml`: exact local PUT CORS rule.
- `api/test/listing-media-stack.smoke.spec.ts`: opt-in real PostgreSQL/MinIO journey through HTTP.

---

### Task 1: Add the canonical cover relation without rewriting legacy media

**Files:**
- Modify: `api/prisma/schema.prisma:129-158,212-239`
- Create: `api/prisma/migrations/20260814133000_listing_media_cover/migration.sql`
- Create: `api/test/listing-media-cover-schema.spec.ts`

**Interfaces:**
- Produces: `Listing.coverMediaId: string | null` and `Listing.coverMedia: ListingMedia | null`.
- Preserves: all existing `Listing.image`, `ListingMedia.url`, and media status values.

- [ ] **Step 1: Write the failing schema/migration contract test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(__dirname, "../prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  join(__dirname, "../prisma/migrations/20260814133000_listing_media_cover/migration.sql"),
  "utf8"
);

describe("listing media cover schema", () => {
  it("adds one nullable cover and nulls it when media is deleted", () => {
    expect(schema).toContain("coverMediaId   String?        @unique");
    expect(schema).toContain('@relation("ListingCoverMedia", fields: [coverMediaId], references: [id], onDelete: SetNull)');
    expect(migration).toContain('ADD COLUMN "coverMediaId" TEXT');
    expect(migration).toContain('ON DELETE SET NULL ON UPDATE CASCADE');
  });

  it("does not rewrite the existing media state enum", () => {
    expect(migration).not.toContain('ALTER TYPE "MediaStorageStatus"');
    expect(schema).toContain("PENDING\n  READY\n  PUBLISHED\n  FAILED");
  });
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run: `pnpm -C api vitest run test/listing-media-cover-schema.spec.ts`

Expected: FAIL because the relation and migration are absent.

- [ ] **Step 3: Add the Prisma relations and migration**

Use named relations because `Listing` and `ListingMedia` now have two relationships:

```prisma
model Listing {
  coverMediaId String?        @unique
  coverMedia   ListingMedia?  @relation("ListingCoverMedia", fields: [coverMediaId], references: [id], onDelete: SetNull)
  media        ListingMedia[] @relation("ListingMedia")
}

model ListingMedia {
  listing  Listing  @relation("ListingMedia", fields: [listingId], references: [id], onDelete: Cascade)
  coverFor Listing? @relation("ListingCoverMedia")
}
```

```sql
ALTER TABLE "Listing" ADD COLUMN "coverMediaId" TEXT;
CREATE UNIQUE INDEX "Listing_coverMediaId_key" ON "Listing"("coverMediaId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_coverMediaId_fkey"
  FOREIGN KEY ("coverMediaId") REFERENCES "ListingMedia"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Validate Prisma and the focused test**

Run: `pnpm -C api prisma validate && pnpm -C api vitest run test/listing-media-cover-schema.spec.ts`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814133000_listing_media_cover/migration.sql api/test/listing-media-cover-schema.spec.ts
git commit -m "feat: add listing media cover relation"
```

### Task 2: Build the MinIO storage boundary and safe configuration

**Files:**
- Create: `api/src/listing-media/object-storage.ts`
- Create: `api/src/listing-media/object-storage.config.ts`
- Create: `api/src/listing-media/minio-object-storage.ts`
- Create: `api/test/object-storage.config.spec.ts`
- Create: `api/test/minio-object-storage.spec.ts`
- Modify: `api/src/config/env.ts`
- Modify: `api/.env.example`
- Modify: `api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `OBJECT_STORAGE` injection token.
- Produces: `ObjectStorage.presignPut`, `statObject`, `getObject`, and `deleteObject`.
- Produces: `getObjectStorageConfig(): ObjectStorageConfig`.

- [ ] **Step 1: Write failing configuration and adapter tests**

```ts
expect(getObjectStorageConfig({
  nodeEnv: "development",
  internalEndpoint: "http://minio:9000",
  uploadEndpoint: "http://localhost:9000",
  accessKey: "sublet-local",
  secretKey: "sublet-local-secret",
  bucket: "sublet-listing-media",
  publicApiBaseUrl: "http://localhost:4000/api/v1"
})).toMatchObject({
  internalEndpoint: "http://minio:9000",
  uploadEndpoint: "http://localhost:9000",
  bucket: "sublet-listing-media",
  region: "us-east-1"
});

await expect(storage.presignPut({
  key: "listings/listing-1/8d31b193-5808-48f9-9f83-7a145d79a9eb.webp",
  mimeType: "image/webp",
  expiresInSeconds: 600
})).resolves.toMatchObject({ headers: { "Content-Type": "image/webp" } });

const signed = await storage.presignPut(input);
expect(new URL(signed.url).host).toBe("localhost:9000");
expect(new URL(signed.url).searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
```

Also assert production rejects every missing setting, endpoint URLs reject credentials/path/query/hash, `NoSuchKey` becomes `ObjectStorageNotFoundError`, and bucket/network/timeout failures become `ObjectStorageUnavailableError` without retaining the caught message.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm -C api vitest run test/object-storage.config.spec.ts test/minio-object-storage.spec.ts`

Expected: FAIL because the storage files and dependencies do not exist.

- [ ] **Step 3: Install the runtime dependencies**

Run: `pnpm --dir api add minio @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

Expected: `api/package.json` and `pnpm-lock.yaml` contain the three packages.

- [ ] **Step 4: Define the narrow port and normalized errors**

```ts
import type { Readable } from "node:stream";

export const OBJECT_STORAGE = Symbol("OBJECT_STORAGE");
export const OBJECT_STORAGE_OPERATION_TIMEOUT_MS = 10_000;

export type StoredObjectMetadata = { sizeBytes: number; contentType: string | null };
export type PresignedPut = { url: string; headers: Readonly<Record<string, string>> };

export interface ObjectStorage {
  presignPut(input: { key: string; mimeType: string; expiresInSeconds: number }): Promise<PresignedPut>;
  statObject(key: string): Promise<StoredObjectMetadata>;
  getObject(key: string): Promise<Readable>;
  deleteObject(key: string): Promise<"deleted" | "missing">;
}

export class ObjectStorageNotFoundError extends Error {
  constructor() { super("Object not found"); this.name = "ObjectStorageNotFoundError"; }
}

export class ObjectStorageUnavailableError extends Error {
  constructor() { super("Object storage unavailable"); this.name = "ObjectStorageUnavailableError"; }
}
```

- [ ] **Step 5: Implement strict config and split clients**

`MinioObjectStorage` uses a `Minio.Client` built from `MINIO_INTERNAL_ENDPOINT` for reads/deletes and an `S3Client` built from `MINIO_UPLOAD_ENDPOINT` with `forcePathStyle: true` for signing only:

```ts
const command = new PutObjectCommand({
  Bucket: config.bucket,
  Key: input.key,
  ContentType: input.mimeType
});
const url = await getSignedUrl(uploadClient, command, {
  expiresIn: input.expiresInSeconds,
  signableHeaders: new Set(["content-type"])
});
return { url, headers: Object.freeze({ "Content-Type": input.mimeType }) };
```

Wrap SDK promise acquisition in a 10-second deadline; destroy a late `getObject` stream. Normalize only known object-missing codes (`NoSuchKey`, `NoSuchObject`, `NotFound`) to not-found; treat `NoSuchBucket`, authentication, signature, DNS, socket, and timeout failures as unavailable.

- [ ] **Step 6: Add environment settings**

```dotenv
MINIO_INTERNAL_ENDPOINT="http://localhost:9000"
MINIO_UPLOAD_ENDPOINT="http://localhost:9000"
MINIO_ACCESS_KEY="sublet-local"
MINIO_SECRET_KEY="sublet-local-secret"
MINIO_BUCKET="sublet-listing-media"
PUBLIC_API_BASE_URL="http://localhost:4000/api/v1"
```

Development/test may use those documented local defaults. Production must provide all six explicitly and must not use the local access/secret values.

- [ ] **Step 7: Re-run focused tests and typecheck**

Run: `pnpm -C api vitest run test/object-storage.config.spec.ts test/minio-object-storage.spec.ts && pnpm -C api typecheck`

Expected: PASS and no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add api/src/listing-media/object-storage.ts api/src/listing-media/object-storage.config.ts api/src/listing-media/minio-object-storage.ts api/src/config/env.ts api/.env.example api/test/object-storage.config.spec.ts api/test/minio-object-storage.spec.ts api/package.json pnpm-lock.yaml
git commit -m "feat: add MinIO object storage boundary"
```

### Task 3: Verify image bytes with a bounded stream

**Files:**
- Create: `api/src/listing-media/media-file-validation.ts`
- Create: `api/test/media-file-validation.spec.ts`

**Interfaces:**
- Produces: `verifyImageObject(stream, expected): Promise<VerifiedImageObject>`.
- Produces: `MediaValidationError` with `UNSUPPORTED_TYPE | TOO_LARGE | EMPTY | TRUNCATED | TYPE_MISMATCH`.

- [ ] **Step 1: Write failing signature, size, checksum, and stream tests**

```ts
const fixtures = [
  ["image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00])],
  ["image/png", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])],
  ["image/webp", Buffer.from("RIFF\u0004\u0000\u0000\u0000WEBPVP8 ", "binary")]
] as const;

it.each(fixtures)("verifies %s magic bytes", async (mimeType, bytes) => {
  await expect(verifyImageObject(Readable.from([bytes]), {
    declaredMimeType: mimeType,
    declaredSizeBytes: bytes.length,
    storedContentType: mimeType,
    storedSizeBytes: bytes.length
  })).resolves.toMatchObject({ mimeType, sizeBytes: bytes.length, checksum: expect.stringMatching(/^[a-f0-9]{64}$/) });
});
```

Add separate tests for zero bytes, declared/stored/stream length disagreement, a 10 MB + 1 byte stream, unsupported magic, MIME/magic mismatch, stored metadata mismatch, stream error, and a stream that never completes before the deadline.

- [ ] **Step 2: Run the test to verify RED**

Run: `pnpm -C api vitest run test/media-file-validation.spec.ts`

Expected: FAIL because the validator is absent.

- [ ] **Step 3: Implement bounded streaming and magic detection**

```ts
export const MAX_LISTING_IMAGE_BYTES = 10 * 1024 * 1024;

export function detectImageMime(prefix: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (prefix.length >= 3 && prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff) return "image/jpeg";
  if (prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (prefix.length >= 12 && prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
```

Read at most `MAX_LISTING_IMAGE_BYTES + 1`, retain only the first 12 bytes for detection, update `createHash("sha256")` per chunk, count the whole stream, and destroy it on limit/timeout. Require `declaredSizeBytes === storedSizeBytes === streamedSizeBytes` and `declaredMimeType === storedContentType === detectedMimeType`.

- [ ] **Step 4: Re-run validation tests**

Run: `pnpm -C api vitest run test/media-file-validation.spec.ts`

Expected: PASS with no decoder or image-processing dependency added.

- [ ] **Step 5: Commit**

```bash
git add api/src/listing-media/media-file-validation.ts api/test/media-file-validation.spec.ts
git commit -m "feat: verify listing image streams"
```

### Task 4: Implement upload initialization, owner recovery, and idempotent finalize

**Files:**
- Create: `api/src/listing-media/listing-media.errors.ts`
- Create: `api/src/listing-media/listing-media.presenter.ts`
- Create: `api/src/listing-media/dto.ts`
- Create: `api/src/listing-media/listing-media.service.ts`
- Create: `api/test/support/fake-object-storage.ts`
- Create: `api/test/listing-media.service.spec.ts`

**Interfaces:**
- Consumes: `ObjectStorage`, `verifyImageObject`, `PrismaService`, `requirePublishCapableProfile`.
- Produces: `initializeUpload(ownerId, listingId, input)`, `findOwned(ownerId, listingId)`, and `finalize(ownerId, listingId, mediaId)`.
- Produces: `SafeListingMedia` and `InitializedListingMedia` without storage keys.

- [ ] **Step 1: Write failing initialization and recovery tests**

Test the MIME allowlist, byte range `1..10 MB`, category trimming, publish-capable profile, owner-hiding 404, `DRAFT`/`REJECTED`, 12-row boundary, random safe extension, presign-before-create ordering, serializable count conflict, dense initial `sortOrder`, 10-minute expiry, and response redaction.

```ts
const initialized = await service.initializeUpload("owner-1", "listing-1", {
  filename: "../卧室.webp",
  mimeType: "image/webp",
  sizeBytes: 842_116,
  kind: " 卧室 "
});

expect(initialized).toMatchObject({
  kind: "卧室",
  sortOrder: 0,
  storageStatus: "PENDING",
  uploadHeaders: { "Content-Type": "image/webp" },
  uploadExpiresAt: expect.any(Date)
});
expect(JSON.stringify(initialized)).not.toMatch(/originalKey|minio|bucket|secret|signature/i);
expect(storage.presignInputs[0].key).toMatch(/^listings\/listing-1\/[0-9a-f-]{36}\.webp$/);
```

- [ ] **Step 2: Write failing finalize tests**

Cover valid JPEG/PNG/WebP, `READY` and `PUBLISHED` idempotency, `FAILED` conflict, expired-but-present finalize success, metadata/magic/length failures, best-effort invalid-object deletion, missing/unavailable storage, conditional concurrent finalize, verified metadata/checksum, cover selection, and no content URL for `PENDING`/`FAILED`.

- [ ] **Step 3: Run service tests to verify RED**

Run: `pnpm -C api vitest run test/listing-media.service.spec.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Define stable product errors and safe output**

Use exact mappings:

```ts
export const mediaErrors = {
  invalidRequest: [400, "LISTING_MEDIA_INVALID_REQUEST", "图片信息有误，请重新选择文件。"],
  notFound: [404, "LISTING_MEDIA_NOT_FOUND", "未找到可访问的图片。"],
  limit: [409, "LISTING_MEDIA_LIMIT_REACHED", "每套房源最多上传 12 张图片。"],
  locked: [409, "LISTING_MEDIA_LOCKED", "当前房源状态不能修改图片。"],
  stale: [409, "LISTING_MEDIA_STALE", "图片状态已变化，请刷新后重试。"],
  tooLarge: [413, "LISTING_MEDIA_TOO_LARGE", "单张图片不能超过 10 MB。"],
  unsupported: [415, "LISTING_MEDIA_TYPE_UNSUPPORTED", "仅支持 JPEG、PNG 或 WebP 图片。"],
  unavailable: [503, "LISTING_MEDIA_STORAGE_UNAVAILABLE", "图片服务暂时不可用，请稍后重试。"]
} as const;
```

The owner representation contains only `id`, `kind`, `sortOrder`, `mimeType`, `sizeBytes`, `checksum`, `storageStatus`, `reviewStatus`, `uploadExpiresAt`, `finalizedAt`, `publishedAt`, `retryable`, and optional `contentUrl`.

- [ ] **Step 5: Implement initialization with a serializable count gate**

Validate and authorize before presigning, then re-read listing ownership/status and count inside a serializable transaction before creating the row. Persist the declared values in `mimeType` and `sizeBytes`, plus `kind`, `sortOrder`, `originalKey`, and `uploadExpiresAt`; set `url: null`, leave verified-only values/timestamps null, and never persist `filename`. Map Prisma serialization conflict `P2034` to the 409 stale/limit contract after a final count read. The row is created only after presigning succeeds.

- [ ] **Step 6: Implement race-safe finalize**

For invalid bytes, conditionally update `{ id, listingId, storageStatus: "PENDING" }` to `FAILED`; delete the object only when `count === 1`. For valid bytes, use one database transaction to conditionally write `READY` metadata and recompute `coverMediaId` from the first ordered `READY` row. If the conditional update loses, re-read and return `READY`/`PUBLISHED` idempotently or return the stable stale error.

- [ ] **Step 7: Re-run service tests**

Run: `pnpm -C api vitest run test/listing-media.service.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/listing-media/listing-media.errors.ts api/src/listing-media/listing-media.presenter.ts api/src/listing-media/dto.ts api/src/listing-media/listing-media.service.ts api/test/support/fake-object-storage.ts api/test/listing-media.service.spec.ts
git commit -m "feat: add listing media upload lifecycle"
```

### Task 5: Add complete ordering, recoverable deletion, and authorized content reads

**Files:**
- Modify: `api/src/listing-media/listing-media.service.ts`
- Modify: `api/test/listing-media.service.spec.ts`

**Interfaces:**
- Produces: `reorder(ownerId, listingId, orderedMediaIds): Promise<SafeListingMedia[]>`.
- Produces: `remove(ownerId, listingId, mediaId): Promise<void>`.
- Produces: `openContent(mediaId, viewerId?): Promise<AuthorizedMediaContent>`.
- Produces lifecycle hooks: `assertSubmittable(transaction, listingId)` and `publishForApproval(transaction, listingId, publishedAt)`.

- [ ] **Step 1: Add failing order/cover tests**

Test exact full-ID permutation, duplicate/omission/foreign/unknown IDs, editable state re-read, dense zero-based rewrite, first `READY` cover, first pending item skipped for cover, concurrent stale request, and transaction rollback.

```ts
await service.reorder("owner-1", "listing-1", ["media-3", "media-1", "media-2"]);
expect(prisma.mediaFor("listing-1").map(({ id, sortOrder }) => [id, sortOrder])).toEqual([
  ["media-3", 0], ["media-1", 1], ["media-2", 2]
]);
expect(prisma.listingFor("listing-1").coverMediaId).toBe("media-3");
```

- [ ] **Step 2: Add failing deletion tests**

Test storage-before-row ordering, missing-object success, retry after a database delete failure, pending/failed/ready deletion, locked states, owner-hiding 404, dense reorder after delete, and cover recomputation.

- [ ] **Step 3: Add failing content authorization tests**

Test `PUBLISHED` anonymous access with immutable cache metadata, `READY` owner-only access with private no-store metadata, non-owner/admin/missing/rejected/pending/failed safe 404, and storage unavailable 503.

- [ ] **Step 4: Run focused service tests to verify RED**

Run: `pnpm -C api vitest run test/listing-media.service.spec.ts`

Expected: new order/delete/content cases fail.

- [ ] **Step 5: Implement order and deletion transactions**

`reorder` re-reads the listing and all rows in one transaction, compares sets and lengths, performs explicit `sortOrder: index` updates, and updates the cover. `remove` authorizes first, removes `originalKey` from storage, then transactionally deletes the row, compacts remaining rows, and recomputes cover.

- [ ] **Step 6: Implement content and lifecycle hooks**

`openContent` returns `{ stream, mimeType, sizeBytes, checksum, visibility }`, where `visibility` is `public` only for `PUBLISHED` media whose listing is still `APPROVED`, and `private` only for a `READY` listing owner. Owner-list presentation adds `contentUrl` only for `READY`; the public listing presenter adds it only for `PUBLISHED`. `assertSubmittable` rejects zero MinIO-ready rows, any non-ready row, URL-only rows, or a cover outside the ready set. `publishForApproval` updates all ordered `READY` rows to `PUBLISHED`, sets `reviewStatus: APPROVED`, `publishedAt`, and preserves order/cover.

- [ ] **Step 7: Re-run focused service tests**

Run: `pnpm -C api vitest run test/listing-media.service.spec.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/listing-media/listing-media.service.ts api/test/listing-media.service.spec.ts
git commit -m "feat: manage listing media order and delivery"
```

### Task 6: Expose the safe HTTP contract

**Files:**
- Create: `api/src/listing-media/listing-media.controller.ts`
- Create: `api/src/listing-media/listing-media.module.ts`
- Create: `api/test/listing-media.controller.spec.ts`
- Create: `api/test/listing-media.e2e.spec.ts`
- Modify: `api/src/listings/listings.module.ts`

**Interfaces:**
- Produces exactly the six approved routes; no retry endpoint and no storage URL redirect.

- [ ] **Step 1: Write failing controller delegation/guard tests**

Assert `AuthGuard` on all `/listings/:id/media` commands, `OptionalAuthGuard` on content, authenticated user ID delegation, empty finalize body, and no accidental admin bypass.

- [ ] **Step 2: Write failing HTTP DTO and response tests**

Exercise:

```text
POST   /listings/:id/media/uploads
POST   /listings/:id/media/:mediaId/finalize
GET    /listings/:id/media
PATCH  /listings/:id/media/order
DELETE /listings/:id/media/:mediaId
GET    /listing-media/:mediaId/content
```

Assert whitelist rejection of `originalKey`, `checksum`, `storageStatus`, `finalizedAt`, `verifiedSizeBytes`, and unknown fields. Assert exact safe 400/404/409/413/415/503 bodies and absence of keys, bucket, endpoint, credential, signature, raw MinIO text, and database text.

- [ ] **Step 3: Run HTTP tests to verify RED**

Run: `pnpm -C api vitest run test/listing-media.controller.spec.ts test/listing-media.e2e.spec.ts`

Expected: FAIL because controllers/module are absent.

- [ ] **Step 4: Implement DTOs and controllers**

`InitializeListingMediaDto` validates a non-empty filename (maximum 255 characters), exact MIME allowlist, integer size `1..10_485_760`, and non-empty kind (maximum 40). `OrderListingMediaDto` requires an array of 1..12 non-empty string IDs.

Define an empty `FinalizeListingMediaDto` and bind it through a whitelist/`forbidNonWhitelisted` pipe so `{}` succeeds while any client-supplied storage field is rejected. Return delete with HTTP 204 and no JSON body; initialize/finalize retain Nest POST status 201.

Return content through `StreamableFile` and set:

```ts
response.setHeader("Content-Type", content.mimeType);
response.setHeader("Content-Length", String(content.sizeBytes));
response.setHeader("ETag", `"${content.checksum}"`);
response.setHeader(
  "Cache-Control",
  content.visibility === "public" ? "public, max-age=31536000, immutable" : "private, no-store"
);
```

- [ ] **Step 5: Wire the module with a replaceable token**

`ListingMediaModule` imports `AuthModule`, provides `OBJECT_STORAGE` with `getObjectStorageConfig()` and `MinioObjectStorage`, provides/exports `ListingMediaService`, and registers both controllers. `ListingsModule` imports `ListingMediaModule`; do not import it separately in `AppModule`.

- [ ] **Step 6: Re-run HTTP tests and API typecheck**

Run: `pnpm -C api vitest run test/listing-media.controller.spec.ts test/listing-media.e2e.spec.ts && pnpm -C api typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/listing-media/listing-media.controller.ts api/src/listing-media/listing-media.module.ts api/src/listings/listings.module.ts api/test/listing-media.controller.spec.ts api/test/listing-media.e2e.spec.ts
git commit -m "feat: expose listing media api"
```

### Task 7: Integrate listing submission, approval, compatibility, and route retirement

**Files:**
- Modify: `api/src/listings/dto.ts:21-36,81-265,283-302`
- Modify: `api/src/listings/listings.controller.ts:1-81`
- Modify: `api/src/listings/listings.service.ts:10-310`
- Create: `api/src/http/legacy-listing-media-retirement.ts`
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/test/listings.controller.spec.ts`
- Modify: `api/test/listings-validation.e2e.spec.ts`
- Modify: `api/test/listings-review.integration.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`

**Interfaces:**
- Consumes: `ListingMediaService.assertSubmittable` and `publishForApproval`.
- Produces: public `image` derived from cover content or legacy fallback.
- Produces: stable 410 response for retired `POST /listings/:id/media`.

- [ ] **Step 1: Write failing create/update compatibility tests**

Assert create succeeds without `image` and stores `""`; create/update requests containing `image` receive 400. Assert approved legacy listings with null cover retain the stored remote `image`; a covered listing returns `${PUBLIC_API_BASE_URL}/listing-media/<coverId>/content` without persisting that URL. A corrupted/foreign cover relation must not be presented and falls back to the legacy `image` value.

- [ ] **Step 2: Write failing lifecycle tests**

Cover submission rejection for zero media, pending, failed, mixed, URL-only, and invalid cover; successful `DRAFT`/`REJECTED` submission; approval publishing media/listing atomically; rejection preserving ready/pending-review media; concurrent approve/reject single winner; and submitted/approved media lock.

- [ ] **Step 3: Write failing redaction and retirement tests**

Assert public catalog/detail, `/listings/mine`, and admin review queue never serialize object keys or MinIO configuration. Assert the old POST returns:

```json
{
  "statusCode": 410,
  "code": "LISTING_MEDIA_URL_RETIRED",
  "message": "图片 URL 添加功能已停用，请使用文件上传。",
  "replacement": "/api/v1/listings/:id/media/uploads"
}
```

- [ ] **Step 4: Run listing tests to verify RED**

Run: `pnpm -C api vitest run test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts test/listings-review.integration.spec.ts`

Expected: FAIL on media gates, public cover projection, DTO image rejection, and route retirement.

- [ ] **Step 5: Remove client-owned image and raw media projections**

Delete `image` from `editableListingFields`, `CreateListingDto`, `UpdateListingDto`, and `listingUpdateData`; create rows with `image: ""`. Replace raw Prisma return objects with explicit listing presenters. Public detail may include safe ordered media content URLs, owner/admin listing reads use `mediaCount` plus safe metadata, and the dedicated owner media endpoint remains the recovery source.

- [ ] **Step 6: Make submit and approval transactional**

`submit` starts a transaction, re-reads ownership and editable status, calls `assertSubmittable`, then conditionally updates the listing to `SUBMITTED`. `approve` conditionally moves `SUBMITTED → APPROVED`, calls `publishForApproval` with the same timestamp and transaction, and appends the audit event before commit. `reject` changes only listing review fields and audit data.

- [ ] **Step 7: Retire URL media with stable 410**

Keep `@Post(":id/media")` as a guarded compatibility route that always calls `legacyListingMediaRetired()`. Remove `CreateListingMediaDto` and `ListingsService.addMedia`; do not silently accept or create URL-backed rows.

- [ ] **Step 8: Re-run listing and integration tests**

Run: `pnpm -C api vitest run test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts test/listings-review.integration.spec.ts`

Expected: PASS, including real PostgreSQL transaction tests when `RUN_DB_SMOKE=1` is supplied.

- [ ] **Step 9: Commit**

```bash
git add api/src/listings api/src/http/legacy-listing-media-retirement.ts api/test/listings.service.spec.ts api/test/listings.controller.spec.ts api/test/listings-validation.e2e.spec.ts api/test/listings-review.integration.spec.ts api/test/support/launch-prisma-mock.ts
git commit -m "feat: integrate media with listing review"
```

### Task 8: Provision private local MinIO and prove the real stack

**Files:**
- Modify: `docker-compose.yml`
- Create: `docker/minio/cors.xml`
- Modify: `tools/local-setup.sh`
- Modify: `api/package.json`
- Create: `api/test/listing-media-stack.smoke.spec.ts`

**Interfaces:**
- Produces: private `sublet-listing-media` bucket with PUT CORS from `http://localhost:3000`.
- Produces: `pnpm -C api launch:smoke:media` opt-in HTTP journey.

- [ ] **Step 1: Write the gated black-box smoke test**

When `RUN_MEDIA_STACK_SMOKE=1`, the test uses the running `MEDIA_STACK_API_URL` to:

1. sign in a publish-capable owner and local admin;
2. create a listing without `image`;
3. initialize a real PNG upload and PUT exact bytes with returned headers;
4. finalize, order, and verify cover recovery;
5. submit and approve with admin step-up;
6. fetch public bytes and compare MIME/checksum/body;
7. initialize JPEG rows containing PNG bytes and an actual 10 MB + 1 byte object, then assert 415 and 413 without leaked storage text.

Use one valid 1x1 PNG fixture decoded from a constant base64 string so the test does not depend on image libraries.

- [ ] **Step 2: Run the smoke test without services to verify it is gated**

Run: `pnpm -C api vitest run test/listing-media-stack.smoke.spec.ts`

Expected: suite is skipped and exits 0 when `RUN_MEDIA_STACK_SMOKE` is absent.

- [ ] **Step 3: Add MinIO and idempotent initialization**

Pin local development images to `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` and `minio/mc:RELEASE.2025-08-13T08-35-41Z`. Add `/minio/health/ready`, a persistent data volume, API dependency on successful initialization, private bucket creation, anonymous-access removal, and `mc cors set` using the XML file.

```xml
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>http://localhost:3000</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedHeader>content-type</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

Set API container values to internal `http://minio:9000`, upload `http://localhost:9000`, bucket `sublet-listing-media`, and public API base `http://localhost:4000/api/v1`; expose no MinIO settings to the web container.

For the black-box smoke account only, set `LOCAL_ADMIN_EMAILS=media-smoke-admin@example.edu` in the development API container and use that exact address in the smoke test. Production already rejects this development-only mechanism.

- [ ] **Step 4: Extend local setup and add the smoke script**

`tools/local-setup.sh` starts `db minio minio-init`, waits on PostgreSQL and successful MinIO initialization, then migrates/seeds. Add:

```json
"launch:smoke:media": "RUN_MEDIA_STACK_SMOKE=1 vitest run test/listing-media-stack.smoke.spec.ts"
```

- [ ] **Step 5: Run the real smoke gate**

Run:

```bash
docker compose up -d db minio minio-init api
MEDIA_STACK_API_URL=http://localhost:4000/api/v1 pnpm -C api launch:smoke:media
```

Expected: the complete valid journey and mismatched/oversized rejection cases pass.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker/minio/cors.xml tools/local-setup.sh api/package.json api/test/listing-media-stack.smoke.spec.ts
git commit -m "test: prove MinIO listing media stack"
```

### Task 9: Add frontend media contracts, Blob recovery, and a three-upload scheduler

**Files:**
- Modify: `lib/api.ts:5-35,363-387,487-523`
- Create: `lib/listing-media.ts`
- Create: `tests/listing-media.test.ts`
- Modify: `lib/product-errors.ts`
- Modify: `tests/product-errors.test.ts`

**Interfaces:**
- Produces: `ApiListingMedia`, `InitializedApiListingMedia`, and `ListingMediaSummary`.
- Produces: initialize/finalize/list/order/delete/blob API functions.
- Produces: `putPresignedFile` and `runMediaUploadQueue` with maximum concurrency 3.

Use one summary shape across the library, uploader, and wizard:

```ts
export type ListingMediaSummary = {
  totalCount: number;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  mutationPending: boolean;
};
```

- [ ] **Step 1: Write failing API/error tests**

Assert safe parsing of media error codes, authenticated absolute Blob fetch, delete without JSON parsing, content-type PUT headers, progress `0..100`, and no raw response body retention.

- [ ] **Step 2: Write failing queue/recovery tests**

Test `queued → uploading → finalizing → ready`, finalize-only readiness, maximum three active PUTs, partial failure isolation, in-session retry with retained `File`, fresh initialization after deleting stale row, refresh recovery, expired pending/failed reselect, ordered ID patching, and Blob URL cleanup.

```ts
expect(maxObservedConcurrency).toBe(3);
expect(statesFor("file-1")).toEqual(["queued", "uploading", "finalizing", "ready"]);
expect(statesFor("file-2").at(-1)).toBe("failed");
expect(statesFor("file-3").at(-1)).toBe("ready");
```

- [ ] **Step 3: Run frontend library tests to verify RED**

Run: `pnpm vitest run tests/listing-media.test.ts tests/product-errors.test.ts`

Expected: FAIL because the media client/scheduler is absent.

- [ ] **Step 4: Add exact frontend types and API helpers**

```ts
export type ApiListingMedia = {
  id: string;
  kind: string;
  sortOrder: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | null;
  sizeBytes: number | null;
  checksum: string | null;
  storageStatus: "PENDING" | "READY" | "PUBLISHED" | "FAILED";
  reviewStatus: "PENDING" | "APPROVED" | "REJECTED";
  uploadExpiresAt: string | null;
  finalizedAt: string | null;
  publishedAt: string | null;
  retryable: boolean;
  contentUrl?: string;
};
```

Add `apiDelete`, `apiGetBlobAbsolute`, and media-specific functions. The Blob helper sends the bearer/device headers but never prepends `API_BASE_URL` to the absolute `contentUrl`.

Extend `ApiListing` with `mediaCount?: number`; remove its raw `media` array from owner-list assumptions. Public detail media, when present, uses `ApiListingMedia` safe fields only.

- [ ] **Step 5: Implement XHR and the scheduler**

```ts
xhr.open("PUT", upload.url);
for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
xhr.upload.onprogress = (event) => {
  if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
};
xhr.send(file);
```

Use three workers over one shared queue; each worker catches and records its own failure. A retry first deletes the remote stale row, then repeats initialize/PUT/finalize with the retained `File`. Server responses, not local PUT completion, set `ready`. XHR failures discard MinIO response XML/text and raise only a safe local upload failure.

- [ ] **Step 6: Map stable product messages**

Add specific 413/415/409/503 mappings for the media codes while retaining the code allowlist. Unknown or unsafe backend codes continue to use generic safe copy.

- [ ] **Step 7: Re-run frontend library tests**

Run: `pnpm vitest run tests/listing-media.test.ts tests/product-errors.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/api.ts lib/listing-media.ts lib/product-errors.ts tests/listing-media.test.ts tests/product-errors.test.ts
git commit -m "feat: add browser listing media client"
```

### Task 10: Build the focused upload/recovery component

**Files:**
- Create: `components/listing-media-uploader.tsx`
- Create: `tests/listing-media-uploader.test.tsx`

**Interfaces:**
- Consumes: `{ listingId: string; token: string; disabled: boolean; onSummaryChange(summary): void }`.
- Produces: server-backed media management UI and `ListingMediaSummary`.

- [ ] **Step 1: Write failing component tests**

Cover file input and drop, immediate object-URL preview, JPEG/PNG/WebP and 10 MB/12-item client guards, category choice, progress, three-upload scheduling, partial failure, retry, post-refresh reselect, owner Blob recovery, reorder controls, first-item cover badge, delete confirmation, pending-button protection, disabled/locked state, and object URL revocation on replacement/removal/unmount.

- [ ] **Step 2: Run component tests to verify RED**

Run: `pnpm vitest run tests/listing-media-uploader.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement selection, recovery, and safe state copy**

Use `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`, a keyboard-accessible drop zone, `URL.createObjectURL(file)` for selected files, and authenticated Blob URLs for recovered `READY` media. Use Chinese labels `等待上传`, `上传中 42%`, `服务端校验中`, `已保存`, `上传失败`, `重新选择文件`, and `封面`.

- [ ] **Step 4: Implement order and delete behavior**

Provide explicit move-left/move-right controls; after an optimistic reorder, PATCH the complete IDs and replace local order with the server response, rolling back on error. Confirm deletion, disable the row while pending, then revoke its preview and use the returned owner list/refresh to display the recomputed cover.

- [ ] **Step 5: Re-run component and queue tests**

Run: `pnpm vitest run tests/listing-media-uploader.test.tsx tests/listing-media.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/listing-media-uploader.tsx tests/listing-media-uploader.test.tsx
git commit -m "feat: add listing media uploader"
```

### Task 11: Integrate server-backed media into the publish wizard

**Files:**
- Modify: `lib/publish-listing.ts:1-234`
- Modify: `tests/publish-listing.test.ts`
- Modify: `components/sublet-app.tsx:61-86,2242-2286,2625-2635,4862-4947,6091-6341`
- Modify: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Consumes: `ListingMediaUploader` and `ListingMediaSummary`.
- Produces: draft creation before media, save without URL media, media-gated advancement/submission, and refresh editing.

- [ ] **Step 1: Write failing publish-library tests**

Remove URL media from the fixture and assert listing DTOs contain no `image`; draft save creates/updates only the listing; media validation consumes `ListingMediaSummary`; pending/failed/zero-ready blocks media/review; all-ready permits submission; API listing restoration retains remote ID without inventing media URLs.

```ts
expect(mapPublishDraftToListingDto(draft)).not.toHaveProperty("image");
expect(getPublishStepErrors(draft, "media", {
  readyCount: 1, pendingCount: 0, failedCount: 0, totalCount: 1
})).toEqual([]);
expect(getPublishStepErrors(draft, "media", {
  readyCount: 0, pendingCount: 1, failedCount: 0, totalCount: 1
})).toContain("请等待所有图片完成上传和校验。");
```

- [ ] **Step 2: Write failing wizard integration tests**

Assert the step order is basic/pricing/media/review; advancing pricing creates one remote draft before uploader mount; retry updates instead of creating another listing; media step cannot advance with pending/failed state; save-draft is allowed with no media after listing fields are valid; submit is disabled while uploader mutations run; and all URL-entry/stale copy is absent.

- [ ] **Step 3: Run publish tests to verify RED**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/sublet-app-auth-state.test.tsx`

Expected: FAIL on old URL draft shape and old wizard order.

- [ ] **Step 4: Make publish orchestration listing-only**

Remove `PublishMedia` and `uploadedMediaUrls` from `PublishDraft`/`PublishSaveResult`. Remove `image` from `ListingDto`. `executePublishSave` calls only `create` or `update`, and calls `submit` only for final submission. `mapApiListingToPublishDraft` restores listing fields and `remoteListingId`; the uploader independently loads `/listings/:id/media`.

- [ ] **Step 5: Create the server draft before media**

Order steps as basic/pricing/media/review. When advancing from pricing, validate both basic and pricing, call `onSave(draft, false)`, store `remoteListingId`, then mount the uploader. Existing drafts skip create. Saving from the header validates listing fields but does not require media; final submission validates listing fields plus the latest media summary.

- [ ] **Step 6: Pass authentication and media summary through the component boundary**

Pass `token` from `SubletApp` to `PublishScreen` and `PublishingFlow`, render `ListingMediaUploader` only with a remote draft ID, and update summary through its callback. Review shows `${summary.readyCount} 张已保存图片`; the owner listing panel reads `mediaCount` rather than raw `media` rows.

- [ ] **Step 7: Re-run publish and uploader tests**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/listing-media-uploader.test.tsx tests/sublet-app-auth-state.test.tsx`

Expected: PASS, with no `图片 URL` control or copy.

- [ ] **Step 8: Commit**

```bash
git add lib/publish-listing.ts components/sublet-app.tsx tests/publish-listing.test.ts tests/sublet-app-auth-state.test.tsx
git commit -m "feat: use uploaded media in publish flow"
```

### Task 12: Run the complete release gate and document operations

**Files:**
- Modify: `README.md:5-48,154-222`
- Modify: `api/test/launch-smoke.spec.ts`

**Interfaces:**
- Produces: documented local setup, operational boundary, and final verification evidence.

- [ ] **Step 1: Update the existing database smoke journey**

Replace its URL-image listing path with a fake-storage-backed or real-media-ready fixture so ordinary `RUN_DB_SMOKE=1` still proves listing submission/review under the new requirement. Keep the full real MinIO byte journey in `listing-media-stack.smoke.spec.ts`.

- [ ] **Step 2: Update README**

Document MinIO as part of the local stack; supported formats; 10 MB/12-image/three-upload limits; private bucket; internal versus upload endpoints; recovery behavior; `launch:smoke:media`; production bucket/CORS provisioning responsibility; and the rule that API startup/operations fail safely when the bucket is absent. Remove the current-scope claim that MinIO uploads are not wired.

- [ ] **Step 3: Run focused backend suites**

Run:

```bash
pnpm -C api vitest run test/object-storage.config.spec.ts test/minio-object-storage.spec.ts test/media-file-validation.spec.ts test/listing-media.service.spec.ts test/listing-media.controller.spec.ts test/listing-media.e2e.spec.ts test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts
```

Expected: all focused backend tests pass.

- [ ] **Step 4: Run focused frontend suites**

Run:

```bash
pnpm vitest run tests/listing-media.test.ts tests/listing-media-uploader.test.tsx tests/publish-listing.test.ts tests/product-errors.test.ts tests/sublet-app-auth-state.test.tsx
```

Expected: all focused frontend tests pass.

- [ ] **Step 5: Run all non-opt-in release checks**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm -C api test
pnpm -C api typecheck
pnpm -C api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api prisma validate
```

Expected: every command exits 0 with no lint warning, type error, test failure, or build failure.

- [ ] **Step 6: Run PostgreSQL concurrency and real MinIO gates**

Run:

```bash
docker compose up -d db minio minio-init api
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api vitest run test/listings-review.integration.spec.ts test/launch-smoke.spec.ts
MEDIA_STACK_API_URL=http://localhost:4000/api/v1 pnpm -C api launch:smoke:media
```

Expected: transaction concurrency, ordinary database smoke, valid real upload/public delivery, mismatched object rejection, and oversized object rejection all pass.

- [ ] **Step 7: Inspect redaction and diff hygiene**

Run:

```bash
rg -n "originalKey|processedKey|publicMainKey|publicThumbnailKey|MINIO_SECRET_KEY|X-Amz-Signature" api/src/listing-media lib/listing-media.ts components/listing-media-uploader.tsx
git diff --check
git status --short
```

Expected: storage identifiers occur only inside the backend storage/service implementation, never in presenter/controller/frontend output; no secret or signature is logged; `git diff --check` is empty; unrelated existing changes remain unstaged.

- [ ] **Step 8: Commit documentation and smoke updates**

```bash
git add README.md api/test/launch-smoke.spec.ts
git commit -m "docs: document MinIO listing media workflow"
```

---

## Spec Coverage Checklist

- Initialization: owner/profile/editable-state checks, allowlist, 1 byte..10 MB, 12-row limit, safe random key, 10-minute content-type-bound PUT.
- Finalize: metadata + magic + declared type agreement, 10 MB + 1 streaming limit, SHA-256, empty/truncated/mismatched rejection, idempotency, race-safe failure cleanup.
- Owner recovery: safe state/timestamps/metadata, authenticated Blob preview only for `READY`, expired pending retryability, reselect after refresh.
- Management: complete-order validation, dense sort, cover from first ready item, storage-first recoverable delete, cover recomputation, state locks.
- Lifecycle: submission gate, URL-only rejection for editable drafts, atomic approval publication, rejection preservation, conditional review transitions.
- Delivery/security: owner-private ready content, public immutable published content, checksum ETag, safe 404 hiding, no key/endpoint/credential/raw error exposure.
- Compatibility: new drafts without image URL, legacy approved image fallback, no URL import, stable 410 retired route.
- Frontend: file/drop input, local preview, category, true XHR progress, concurrency 3, partial failure, retry/reselect, refresh recovery, reorder/cover/delete, wizard blocking.
- Operations/testing: private Docker bucket and PUT CORS, fake storage unit/HTTP coverage, real PostgreSQL/MinIO journey, full lint/type/test/build/Prisma gates.
