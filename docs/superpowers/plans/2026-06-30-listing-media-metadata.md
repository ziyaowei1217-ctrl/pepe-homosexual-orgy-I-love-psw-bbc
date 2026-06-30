# Listing Media Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-managed listing media metadata using the existing `ListingMedia` Prisma model.

**Architecture:** Extend the listing DTO/controller/service layer with a validated `POST /listings/:id/media` endpoint. Keep media creation subject to the same owner and editable-state rules as listing edits, and include sorted media on detail, owner, and admin review reads.

**Tech Stack:** NestJS, Prisma, class-validator/class-transformer, Vitest, Supertest, TypeScript.

---

## File Structure

- Modify `api/src/listings/dto.ts`: add `CreateListingMediaDto`.
- Modify `api/src/listings/listings.controller.ts`: add `POST /:id/media`.
- Modify `api/src/listings/listings.service.ts`: add media include helpers and `addMedia()`.
- Modify `api/test/listings.service.spec.ts`: add service media tests and mock support.
- Modify `api/test/listings.controller.spec.ts`: add controller delegation test.
- Modify `api/test/listings-validation.e2e.spec.ts`: add HTTP media validation/authorization tests.
- Modify `api/test/support/launch-prisma-mock.ts`: add `listingMedia.create` support and include-aware listing reads.
- Create `docs/superpowers/specs/2026-06-30-listing-media-metadata-design.md`: design record.
- Create `docs/superpowers/plans/2026-06-30-listing-media-metadata.md`: implementation plan.

## Task 1: Write Failing Tests

- [ ] **Step 1: Add service tests**

In `api/test/listings.service.spec.ts`, add tests proving:

- `addMedia()` creates media for an owner-owned `DRAFT` listing.
- `addMedia()` creates media for an owner-owned `REJECTED` listing.
- `addMedia()` returns `NotFoundException` for non-owners.
- `addMedia()` returns `BadRequestException` for `SUBMITTED` and `APPROVED`.
- `findOne()`, `findMine()`, and `findReviewQueue()` request sorted media includes.

- [ ] **Step 2: Add controller test**

In `api/test/listings.controller.spec.ts`, add a test proving `ListingsController.addMedia()` passes `request.user.id`, listing id, and DTO to `ListingsService.addMedia()`.

- [ ] **Step 3: Add HTTP validation tests**

In `api/test/listings-validation.e2e.spec.ts`, add tests proving:

- Valid owner media metadata is accepted.
- Invalid URL, empty kind, extra fields, and bad `sortOrder` return `400`.
- Non-owner media creation returns `404`.

- [ ] **Step 4: Run tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts
```

Expected: tests fail because the DTO, controller method, service method, and mock support do not exist yet.

## Task 2: Implement Listing Media

- [ ] **Step 1: Add DTO**

Add `CreateListingMediaDto` with `url`, `kind`, and optional `sortOrder`.

- [ ] **Step 2: Add controller route**

Add `POST /listings/:id/media` behind `AuthGuard`, using an explicit body validation pipe with `expectedType: CreateListingMediaDto`.

- [ ] **Step 3: Add service logic**

Add `addMedia(ownerId, id, dto)` and include sorted media on detail, mine, and review queue reads.

- [ ] **Step 4: Update mocks**

Update service and launch Prisma mocks to support `listingMedia.create` and listing `include.media.orderBy`.

- [ ] **Step 5: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts
```

Expected: tests pass.

## Task 3: Launch Verification And Commit

- [ ] **Step 1: Run API launch check**

Run:

```bash
npm run launch:check
```

Expected: tests, typecheck, build, and Prisma validate pass.

- [ ] **Step 2: Run real database smoke**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: smoke test passes against Docker Postgres.

- [ ] **Step 3: Commit**

Run:

```bash
git add api/src/listings/dto.ts api/src/listings/listings.controller.ts api/src/listings/listings.service.ts api/test/listings.service.spec.ts api/test/listings.controller.spec.ts api/test/listings-validation.e2e.spec.ts api/test/support/launch-prisma-mock.ts docs/superpowers/specs/2026-06-30-listing-media-metadata-design.md docs/superpowers/plans/2026-06-30-listing-media-metadata.md
git commit -m "feat: add listing media metadata"
```
