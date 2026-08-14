# Listing Media Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace URL-based listing photos with a persistent MinIO-backed upload lifecycle that enforces the exact `待上传 → 已上传待校验 → 可用 → 已发布` state flow.

**Architecture:** A focused listing-media service owns presigned uploads, server-side byte validation, ordering, cover selection, deletion, retry, and public delivery. `ListingsService` only enforces listing workflow boundaries: draft/rejected media are editable, submission requires ready media, and approval atomically publishes the ready set. The browser owns local previews and transfer progress but consumes server state as authoritative.

**Tech Stack:** NestJS, Prisma/PostgreSQL 16, MinIO through the AWS S3-compatible SDK, `file-type`, `sharp`, Next.js/React 19, Vitest, Supertest, Docker Compose.

## Global Constraints

- Formats: JPEG, PNG, and WebP only.
- Maximum object size: 10 MB (`10 * 1024 * 1024` bytes).
- Maximum media count: 12 active items per listing.
- Decode ceiling: 40,000,000 input pixels.
- Editable listing states: `DRAFT` and `REJECTED` only.
- Submitted and approved media are locked.
- Failure responses expose stable safe codes, never storage or decoder internals.
- Public delivery is through the API; raw object keys and storage URLs remain private.
- Existing user changes and the unrelated deleted industry-chart file must remain untouched.

---

## File Structure

- Modify `api/prisma/schema.prisma`: exact storage states and `securityErrorCode`.
- Create `api/prisma/migrations/20260814130000_listing_media_lifecycle/migration.sql`: migrate `PENDING` safely and add validation metadata.
- Create `api/src/listing-media/listing-media.constants.ts`: size/count/pixel limits and safe error-code union.
- Create `api/src/listing-media/listing-media.dto.ts`: upload-init and reorder contracts.
- Create `api/src/listing-media/listing-media-storage.ts`: storage interface, token, and S3/MinIO adapter.
- Create `api/src/listing-media/listing-media-validation.ts`: magic-byte, checksum, and dimensions validation.
- Create `api/src/listing-media/listing-media.service.ts`: lifecycle transitions and authorization.
- Create `api/src/listing-media/listing-media.controller.ts`: owned-listing commands and public delivery.
- Create `api/src/listing-media/listing-media.module.ts`: dependency wiring.
- Modify `api/src/config/env.ts`: validated object-storage configuration.
- Modify `api/src/listings/listings.module.ts`: import/export listing-media integration.
- Modify `api/src/listings/listings.service.ts`: submit-ready and approval-publish transitions plus filtered reads.
- Modify `api/src/listings/dto.ts`: stop requiring a client-supplied image URL.
- Modify `api/src/listings/listings.controller.ts`: remove the legacy URL-metadata route.
- Modify `api/src/app.module.ts`: register the media module when required by module boundaries.
- Modify `api/package.json` and `pnpm-lock.yaml`: S3, presigner, file-type, and sharp dependencies.
- Modify `docker-compose.yml`: MinIO and idempotent bucket initialization.
- Create `api/test/listing-media-validation.spec.ts`: real-byte validation tests.
- Create `api/test/listing-media.service.spec.ts`: state, count, authorization, retry, ordering, and deletion tests.
- Create `api/test/listing-media.e2e.spec.ts`: route validation and public-delivery tests with fake storage.
- Modify `api/test/listings.service.spec.ts`: submission and approval integration tests.
- Modify `api/test/listings.controller.spec.ts` and `api/test/listings-validation.e2e.spec.ts`: remove legacy route expectations.
- Modify `api/test/support/launch-prisma-mock.ts`: lifecycle-aware media delegate behavior.
- Create `lib/listing-media-upload.ts`: browser SHA-256, XHR progress, and upload orchestration.
- Create `components/listing-media-uploader.tsx`: preview, progress, retry, remove, reorder, and cover UI.
- Modify `lib/publish-listing.ts`: file-backed draft model and save/submit orchestration.
- Modify `lib/api.ts`: media API types and private/public URL handling.
- Modify `components/sublet-app.tsx`: use the focused uploader and remove URL entry.
- Create `tests/listing-media-upload.test.ts`: browser orchestration behavior.
- Modify `tests/publish-listing.test.ts`: file-media draft and submission gates.
- Modify `README.md`: MinIO setup, lifecycle, limits, and smoke instructions.

---

### Task 1: Persist the exact media lifecycle

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260814130000_listing_media_lifecycle/migration.sql`
- Modify: `api/test/production-database-foundations.migration.spec.ts`

**Interfaces:**
- Produces: `MediaStorageStatus = PENDING_UPLOAD | UPLOADED_PENDING_VALIDATION | READY | PUBLISHED | FAILED`.
- Produces: `ListingMedia.securityErrorCode: string | null`.

- [ ] **Step 1: Write the failing migration assertions**

Add assertions that a legacy `PENDING` row becomes `PENDING_UPLOAD`, the enum order is exact, and `securityErrorCode` defaults to null:

```ts
expect(query(`SELECT array_to_string(enum_range(NULL::"MediaStorageStatus"), ',')`))
  .toBe("PENDING_UPLOAD,UPLOADED_PENDING_VALIDATION,READY,PUBLISHED,FAILED");
expect(query(`SELECT "storageStatus"::text FROM "ListingMedia" WHERE "id" = 'media-1'`))
  .toBe("PENDING_UPLOAD");
expect(query(`SELECT "securityErrorCode" IS NULL FROM "ListingMedia" WHERE "id" = 'media-1'`))
  .toBe("t");
```

- [ ] **Step 2: Run the migration source and disposable-PostgreSQL tests to verify RED**

Run: `cd api && RUN_DB_SMOKE=1 pnpm vitest run test/production-database-foundations.migration.spec.ts`

Expected: FAIL because the new enum values and column do not exist.

- [ ] **Step 3: Add the schema and safe enum migration**

Use a replacement enum inside one transaction so deployed rows are preserved:

```sql
BEGIN;
ALTER TYPE "MediaStorageStatus" RENAME TO "MediaStorageStatus_old";
CREATE TYPE "MediaStorageStatus" AS ENUM (
  'PENDING_UPLOAD', 'UPLOADED_PENDING_VALIDATION', 'READY', 'PUBLISHED', 'FAILED'
);
ALTER TABLE "ListingMedia" ALTER COLUMN "storageStatus" DROP DEFAULT;
ALTER TABLE "ListingMedia" ALTER COLUMN "storageStatus" TYPE "MediaStorageStatus"
USING (CASE WHEN "storageStatus"::text = 'PENDING' THEN 'PENDING_UPLOAD'
            ELSE "storageStatus"::text END)::"MediaStorageStatus";
ALTER TABLE "ListingMedia" ALTER COLUMN "storageStatus" SET DEFAULT 'PENDING_UPLOAD';
ALTER TABLE "ListingMedia" ADD COLUMN "securityErrorCode" TEXT;
DROP TYPE "MediaStorageStatus_old";
COMMIT;
```

- [ ] **Step 4: Re-run the migration tests to verify GREEN**

Run: `cd api && RUN_DB_SMOKE=1 pnpm vitest run test/production-database-foundations.migration.spec.ts`

Expected: PASS with migrate-deploy status current.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814130000_listing_media_lifecycle/migration.sql api/test/production-database-foundations.migration.spec.ts
git commit -m "feat: define listing media lifecycle"
```

### Task 2: Validate stored image bytes independently of the browser

**Files:**
- Create: `api/src/listing-media/listing-media.constants.ts`
- Create: `api/src/listing-media/listing-media-validation.ts`
- Create: `api/test/listing-media-validation.spec.ts`
- Modify: `api/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `validateListingImage(input: Buffer, expected: { sizeBytes: number; checksumSha256: string }): Promise<ValidatedListingImage>`.
- Produces: `ListingMediaSecurityError` carrying one of the safe codes listed in `LISTING_MEDIA_SECURITY_CODES`.

- [ ] **Step 1: Write failing real-byte tests**

Use tiny in-memory JPEG, PNG, and WebP fixtures generated with `sharp`; assert their detected MIME, width, height, byte length, and SHA-256. Add separate tests for unsupported magic bytes, over 10 MB, claimed-size mismatch, checksum mismatch, malformed image data, and an input above 40 megapixels.

```ts
await expect(validateListingImage(validPng, expected(validPng))).resolves.toMatchObject({
  mimeType: "image/png",
  width: 2,
  height: 3
});
await expect(validateListingImage(Buffer.from("not an image"), expectedBytes))
  .rejects.toMatchObject({ code: "IMAGE_TYPE_UNSUPPORTED" });
```

- [ ] **Step 2: Run the validation test to verify RED**

Run: `cd api && pnpm vitest run test/listing-media-validation.spec.ts`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Install and implement the minimal validator**

Add `file-type` and `sharp` as API runtime dependencies. Detect magic bytes with `fileTypeFromBuffer`, allow only `image/jpeg`, `image/png`, and `image/webp`, calculate SHA-256 with `node:crypto`, and call:

```ts
const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
if (!metadata.width || !metadata.height) {
  throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
}
```

Map all decoder exceptions to `IMAGE_DIMENSIONS_UNSAFE`; never include decoder text in the product error.

- [ ] **Step 4: Re-run the validation test to verify GREEN**

Run: `cd api && pnpm vitest run test/listing-media-validation.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/listing-media/listing-media.constants.ts api/src/listing-media/listing-media-validation.ts api/test/listing-media-validation.spec.ts api/package.json pnpm-lock.yaml
git commit -m "feat: validate listing image bytes"
```

### Task 3: Add the private MinIO storage boundary

**Files:**
- Create: `api/src/listing-media/listing-media-storage.ts`
- Modify: `api/src/config/env.ts`
- Modify: `api/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docker-compose.yml`
- Create: `api/test/listing-media-storage.spec.ts`

**Interfaces:**
- Produces: `LISTING_MEDIA_STORAGE` injection token.
- Produces: `ListingMediaStorage.createUploadUrl(key, mimeType, sizeBytes): Promise<{ uploadUrl: string; expiresAt: Date }>`.
- Produces: `ListingMediaStorage.read(key): Promise<Buffer>`, `delete(key): Promise<void>`.

- [ ] **Step 1: Write failing storage/config tests**

Test development defaults, production-required credentials, generated PUT command constraints, full-body reads, and not-found normalization. Assert the upload URL expires in 10 minutes and is bound to the requested content type.

- [ ] **Step 2: Run the tests to verify RED**

Run: `cd api && pnpm vitest run test/listing-media-storage.spec.ts`

Expected: FAIL because the storage adapter and config are absent.

- [ ] **Step 3: Implement the MinIO-compatible adapter**

Add `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`. Generate keys as `listing-media/<listingId>/<uuid>` with no filename. Use path-style S3 requests for MinIO, a private `listing-media` bucket, and a 600-second signed PUT URL.

- [ ] **Step 4: Add MinIO to local Compose**

Add `minio`, a health check, and a one-shot `minio-init` service that creates the private bucket idempotently. Pass only endpoint/bucket/access/secret settings to the API container; do not expose keys to the web container.

- [ ] **Step 5: Re-run storage tests to verify GREEN**

Run: `cd api && pnpm vitest run test/listing-media-storage.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/listing-media/listing-media-storage.ts api/src/config/env.ts api/test/listing-media-storage.spec.ts api/package.json pnpm-lock.yaml docker-compose.yml
git commit -m "feat: add private listing media storage"
```

### Task 4: Implement owner media commands and state transitions

**Files:**
- Create: `api/src/listing-media/listing-media.dto.ts`
- Create: `api/src/listing-media/listing-media.service.ts`
- Create: `api/test/listing-media.service.spec.ts`

**Interfaces:**
- Consumes: `ListingMediaStorage`, `validateListingImage`.
- Produces: `initializeUpload`, `finalize`, `retry`, `findOwned`, `reorder`, and `remove` methods.

- [ ] **Step 1: Write failing service tests**

Cover owner-only access, editable-state checks, the 12-item limit, server-generated keys, `PENDING_UPLOAD`, finalize transition through `UPLOADED_PENDING_VALIDATION`, `READY` metadata, each safe failure code, retry with a new key, reorder as a complete duplicate-free ID permutation, cover at index zero, object deletion, and submitted/approved locks.

```ts
await expect(service.initializeUpload("owner-1", "listing-1", input))
  .resolves.toMatchObject({ media: { storageStatus: "PENDING_UPLOAD" } });
await service.finalize("owner-1", "listing-1", "media-1");
expect(prisma.listingMedia.updateCalls.map((call) => call.data.storageStatus))
  .toEqual(["UPLOADED_PENDING_VALIDATION", "READY"]);
```

- [ ] **Step 2: Run the service tests to verify RED**

Run: `cd api && pnpm vitest run test/listing-media.service.spec.ts`

Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement initialization/finalization**

Initialization validates declared type, size, lowercase 64-character SHA-256, active count, ownership, and listing status. Finalization conditionally updates `PENDING_UPLOAD -> UPLOADED_PENDING_VALIDATION`, reads the stored bytes, validates them, and then conditionally writes either `READY` metadata or `FAILED + securityErrorCode`.

- [ ] **Step 4: Implement retry, reorder, cover, and remove**

Retry is allowed only from `FAILED`, deletes the old object best-effort, generates a new key, clears validation metadata/errors, and returns to `PENDING_UPLOAD`. Reorder accepts all active IDs exactly once; its first ID is the cover. Remove deletes only editable media and cleans its object after the database delete succeeds.

- [ ] **Step 5: Re-run the service tests to verify GREEN**

Run: `cd api && pnpm vitest run test/listing-media.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/listing-media/listing-media.dto.ts api/src/listing-media/listing-media.service.ts api/test/listing-media.service.spec.ts
git commit -m "feat: add listing media commands"
```

### Task 5: Expose media APIs and public delivery

**Files:**
- Create: `api/src/listing-media/listing-media.controller.ts`
- Create: `api/src/listing-media/listing-media.module.ts`
- Modify: `api/src/listings/listings.module.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/src/listings/listings.controller.ts`
- Modify: `api/src/listings/dto.ts`
- Create: `api/test/listing-media.e2e.spec.ts`
- Modify: `api/test/listings.controller.spec.ts`
- Modify: `api/test/listings-validation.e2e.spec.ts`

**Interfaces:**
- Produces authenticated routes below `/listings/:listingId/media` for upload initialization, finalize, retry, list, order, and delete.
- Produces public `GET /listing-media/:mediaId/content` only for `PUBLISHED` media.

- [ ] **Step 1: Write failing HTTP tests**

Assert validation/authorization and route contracts:

```text
POST   /listings/:listingId/media/uploads
POST   /listings/:listingId/media/:mediaId/finalize
POST   /listings/:listingId/media/:mediaId/retry
GET    /listings/:listingId/media
PATCH  /listings/:listingId/media/order
DELETE /listings/:listingId/media/:mediaId
GET    /listing-media/:mediaId/content
```

Test that content delivery is 404 before `PUBLISHED`, and after publication returns exact bytes plus the validated `Content-Type`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable`, and `X-Content-Type-Options: nosniff`.

- [ ] **Step 2: Run HTTP tests to verify RED**

Run: `cd api && pnpm vitest run test/listing-media.e2e.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts`

Expected: FAIL on missing routes and the still-required URL field.

- [ ] **Step 3: Implement controller/module and remove the legacy URL route**

Use explicit `ValidationPipe` instances with whitelist and forbidden-extra-field checks. `CreateListingDto.image` becomes optional and server-controlled; new creates store `image: null` when omitted. Remove `POST /listings/:id/media` and `CreateListingMediaDto`.

- [ ] **Step 4: Re-run HTTP tests to verify GREEN**

Run: `cd api && pnpm vitest run test/listing-media.e2e.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/listing-media api/src/app.module.ts api/src/listings/listings.module.ts api/src/listings/listings.controller.ts api/src/listings/dto.ts api/test/listing-media.e2e.spec.ts api/test/listings.controller.spec.ts api/test/listings-validation.e2e.spec.ts
git commit -m "feat: expose listing media lifecycle api"
```

### Task 6: Lock submission and publish approved media atomically

**Files:**
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`

**Interfaces:**
- Consumes: ready ordered listing media.
- Produces: submission requiring 1–12 `READY` items; approval changes them to `PUBLISHED` and selects index zero as cover.

- [ ] **Step 1: Write failing listing workflow tests**

Test that submission rejects empty, pending, failed, or mixed media sets and accepts 1–12 ready items. Test that approval in one transaction changes only `READY` rows to `PUBLISHED`, sets `publishedAt`, and points `Listing.image` at `/api/v1/listing-media/<coverId>/content`. Public reads include only published media; owner reads include every state.

- [ ] **Step 2: Run listing service tests to verify RED**

Run: `cd api && pnpm vitest run test/listings.service.spec.ts`

Expected: FAIL because submission ignores media readiness and approval does not publish.

- [ ] **Step 3: Implement transactional workflow integration**

Load ordered media before submission. In `approve`, update the submitted listing and ready media in the existing transaction; fail the whole decision if no ready cover exists. Filter public includes by `storageStatus: "PUBLISHED"` while preserving unfiltered owner/review reads.

- [ ] **Step 4: Re-run listing service tests to verify GREEN**

Run: `cd api && pnpm vitest run test/listings.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/listings/listings.service.ts api/test/listings.service.spec.ts api/test/support/launch-prisma-mock.ts
git commit -m "feat: publish validated listing media"
```

### Task 7: Add browser upload orchestration with real progress

**Files:**
- Create: `lib/listing-media-upload.ts`
- Create: `tests/listing-media-upload.test.ts`
- Modify: `lib/api.ts`
- Modify: `lib/publish-listing.ts`
- Modify: `tests/publish-listing.test.ts`

**Interfaces:**
- Produces: `sha256File(file): Promise<string>`.
- Produces: `putFileWithProgress(url, file, onProgress, xhrFactory?): Promise<void>`.
- Produces: `uploadListingMedia(listingId, draftMedia, adapter, onProgress): Promise<ApiListingMedia>`.

- [ ] **Step 1: Write failing browser orchestration tests**

Test JPEG/PNG/WebP acceptance, 10 MB and 12-item client guards, SHA-256, XHR progress, init → PUT → finalize ordering, retry, and that a frontend MIME claim never creates a local `READY` state before finalize returns it.

- [ ] **Step 2: Run frontend library tests to verify RED**

Run: `pnpm vitest run tests/listing-media-upload.test.ts tests/publish-listing.test.ts`

Expected: FAIL because file-backed media and upload orchestration are absent.

- [ ] **Step 3: Implement file-backed draft types and transport**

Replace URL-only draft media with:

```ts
type PublishMedia = {
  id: string;
  file: File | null;
  previewUrl: string;
  kind: string;
  storageStatus: "LOCAL" | ApiListingMedia["storageStatus"];
  progress: number;
  securityErrorCode: string | null;
};
```

Use Web Crypto for SHA-256 and `XMLHttpRequest.upload.onprogress` for per-file progress. Existing server media restore without re-upload.

- [ ] **Step 4: Re-run library tests to verify GREEN**

Run: `pnpm vitest run tests/listing-media-upload.test.ts tests/publish-listing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/listing-media-upload.ts lib/api.ts lib/publish-listing.ts tests/listing-media-upload.test.ts tests/publish-listing.test.ts
git commit -m "feat: orchestrate listing media uploads"
```

### Task 8: Replace URL entry with the host media uploader

**Files:**
- Create: `components/listing-media-uploader.tsx`
- Modify: `components/sublet-app.tsx`
- Create: `tests/listing-media-uploader.test.tsx`

**Interfaces:**
- Consumes: `PublishMedia[]`, locked state, upload callbacks.
- Produces: accessible file selection/drop zone, previews, progress, retry, remove, move-left/right, and cover controls.

- [ ] **Step 1: Write failing component tests**

Test accepted extensions/MIME hints, preview rendering, 12-item cap copy, oversize rejection, progress labels, safe error-code copy, first-item cover label, reorder callbacks, removal, retry, and full lock after submission.

- [ ] **Step 2: Run the component tests to verify RED**

Run: `pnpm vitest run tests/listing-media-uploader.test.tsx`

Expected: FAIL because the component is absent.

- [ ] **Step 3: Implement the focused uploader and integrate it**

Use `<input type="file" accept="image/jpeg,image/png,image/webp" multiple>`, local object URLs, and visible per-item states `待上传 / 已上传待校验 / 可用 / 已发布 / 校验失败`. Revoke local preview URLs when items are removed or the flow unmounts. Remove all “图片 URL” entry and stale “现有接口仅支持追加媒体” copy.

- [ ] **Step 4: Re-run component and publish tests to verify GREEN**

Run: `pnpm vitest run tests/listing-media-uploader.test.tsx tests/listing-media-upload.test.ts tests/publish-listing.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/listing-media-uploader.tsx components/sublet-app.tsx tests/listing-media-uploader.test.tsx
git commit -m "feat: add host image uploader"
```

### Task 9: End-to-end verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `api/test/launch-smoke.spec.ts`

**Interfaces:**
- Produces: Docker-backed proof from draft creation through public image delivery.

- [ ] **Step 1: Add the failing smoke journey**

Extend the opt-in smoke test to create a listing, initialize an upload, PUT a real PNG to MinIO, finalize it, reorder it as cover, submit, approve, and GET identical bytes from the public delivery endpoint.

- [ ] **Step 2: Run the smoke test to verify RED, then complete only missing integration wiring**

Run: `docker compose up -d db minio minio-init && cd api && RUN_DB_SMOKE=1 pnpm vitest run test/launch-smoke.spec.ts`

Expected first run: FAIL at the first incomplete integration boundary. Fix module/config/mock wiring without changing the approved workflow, then rerun until PASS.

- [ ] **Step 3: Update setup and product-scope documentation**

Document the four visible states, failure-code behavior, supported formats, 10 MB/12-image limits, private storage, and local MinIO ports. Remove claims that publishing still uses image URLs.

- [ ] **Step 4: Run the full fresh release gate**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
cd api && pnpm launch:check
```

Expected: every command exits 0 with zero test failures and no lint/type/build errors.

- [ ] **Step 5: Run the Docker-backed smoke gate**

Run:

```bash
docker compose up -d db minio minio-init
cd api && RUN_DB_SMOKE=1 pnpm vitest run test/launch-smoke.spec.ts test/production-database-foundations.migration.spec.ts
```

Expected: both PostgreSQL/MinIO smoke journeys pass.

- [ ] **Step 6: Review the diff and commit**

Confirm `git diff --check` is clean and the unrelated deleted chart file remains unstaged, then:

```bash
git add README.md api/test/launch-smoke.spec.ts
git commit -m "docs: document listing media workflow"
```
