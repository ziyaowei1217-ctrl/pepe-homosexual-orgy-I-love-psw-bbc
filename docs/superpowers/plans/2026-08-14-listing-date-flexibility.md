# Listing Date Flexibility Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete listing availability by persisting and displaying whether dates are negotiable, without weakening strict full-coverage search.

**Architecture:** Add one required server-owned boolean to canonical `Listing`, thread it through owner DTOs and public presentation, and treat any approved-listing change as material review-resetting content. The existing date predicate remains unchanged.

**Tech Stack:** Prisma/PostgreSQL 16, NestJS, Next.js 15, React 19, Vitest.

## Global Constraints

- The canonical field is `Listing.dateFlexible: boolean` and defaults to `false` for existing/new records unless explicitly set.
- Date filtering remains exactly `availableFrom <= moveIn AND availableTo >= moveOut` regardless of flexibility.
- Approved listings changing only `dateFlexible` return to `SUBMITTED` and clear review metadata.
- Host copy is `日期可协商`; public copy is `入住/退租日期可协商`.

---

### Task 1: Persist and expose date flexibility

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260814143000_listing_date_flexibility/migration.sql`
- Modify: `api/src/listings/dto.ts`
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/test/listings-validation.e2e.spec.ts`

**Interfaces:**
- Produces: `CreateListingDto.dateFlexible: boolean` and `UpdateListingDto.dateFlexible?: boolean`.
- Produces: public/owner listing responses containing `dateFlexible`.

- [ ] **Step 1: Write failing service and HTTP tests**

Assert create persistence, explicit false, strict boolean validation, partial update, approved review reset, and unchanged public date predicate:

```ts
await service.create("owner-1", { ...validListing, dateFlexible: true });
expect(prisma.listing.create).toHaveBeenCalledWith(expect.objectContaining({
  data: expect.objectContaining({ dateFlexible: true })
}));
expect(buildListingAvailabilityWhere({ moveIn: "2026-09-01", moveOut: "2026-10-01" }))
  .toEqual({
    availableFrom: { lte: new Date("2026-09-01T00:00:00.000Z") },
    availableTo: { gte: new Date("2026-10-01T00:00:00.000Z") }
  });
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd api && pnpm vitest run test/listings.service.spec.ts test/listings-validation.e2e.spec.ts`

Expected: FAIL because `dateFlexible` is absent/rejected.

- [ ] **Step 3: Add migration, DTO, persistence, and review reset**

Add `"dateFlexible" BOOLEAN NOT NULL DEFAULT FALSE`, the Prisma field, `@IsBoolean()` create/update DTO properties, create/update mapping, and include the field in `isAvailabilityOnlyUpdate`. Do not change `buildListingAvailabilityWhere`.

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run: `cd api && pnpm prisma generate && pnpm vitest run test/listings.service.spec.ts test/listings-validation.e2e.spec.ts test/listing-availability.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814143000_listing_date_flexibility api/src/listings/dto.ts api/src/listings/listings.service.ts api/test/listings.service.spec.ts api/test/listings-validation.e2e.spec.ts
git commit -m "feat: persist listing date flexibility"
```

### Task 2: Add host switch and public flexibility copy

**Files:**
- Modify: `lib/api.ts`
- Modify: `lib/publish-listing.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `tests/publish-listing.test.ts`
- Modify: `tests/listing-detail.test.ts`

**Interfaces:**
- Produces: `ApiListing.dateFlexible`, `PublishDraft.dateFlexible`, and `ListingDto.dateFlexible`.

- [ ] **Step 1: Write failing mapping/UI tests**

Assert draft mapping, create/update payloads, a controlled `日期可协商` host switch, and public `入住/退租日期可协商` copy. Assert a flexible listing outside requested dates remains absent from the server-filtered catalog.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/listing-detail.test.ts tests/listing-catalog.test.ts`

Expected: FAIL because flexibility is not mapped or rendered.

- [ ] **Step 3: Implement mapping, input, and display**

Default new drafts to `false`, preserve server values when editing, send the boolean in every save, and render the public badge only when true. Do not add local search expansion.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/listing-detail.test.ts tests/listing-catalog.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/api.ts lib/publish-listing.ts components/sublet-app.tsx tests/publish-listing.test.ts tests/listing-detail.test.ts
git commit -m "feat: show negotiable listing dates"
```
