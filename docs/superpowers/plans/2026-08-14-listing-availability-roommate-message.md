# Listing Availability And Roommate Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist listing availability, filter the public catalog by a fully covered requested stay, expose dates in the host workflow, and remove stale UI gates from the already working roommate direct-message system.

**Architecture:** Add required PostgreSQL date columns to the canonical `Listing` model, validate date pairs at the HTTP boundary, and translate valid public query pairs into a Prisma coverage predicate. Keep the catalog’s existing pure local filter as a defensive presentation layer, but make server-filtered reads authoritative when both dates are selected. Reuse the current authenticated roommate conversation APIs and only change the product capability/UI states that incorrectly label them unavailable.

**Tech Stack:** Next.js 15, React 19, TypeScript, NestJS, class-validator, Prisma, PostgreSQL, Vitest, React Test Renderer.

## Global Constraints

- PostgreSQL is authoritative for listing availability and roommate conversation state.
- A listing matches only when `availableFrom <= moveIn AND availableTo >= moveOut`.
- Public date query values must be supplied as a valid pair in `YYYY-MM-DD` form.
- Existing listings receive explicit availability values during migration; no nullable compatibility state remains.
- Date labels use “入住/退租” and “天”, not hotel “晚” language.
- Roommate messaging is enabled only when the backend has returned a reciprocal-match conversation.
- Do not add a second roommate messaging path or store roommate message bodies in browser storage.

## File Map

- Create `api/src/listings/listing-availability.ts`: strict ISO-date parsing, range validation, and Prisma coverage predicate construction.
- Create `api/test/listing-availability.spec.ts`: pure availability boundary tests.
- Create `api/prisma/migrations/20260814100000_listing_availability/migration.sql`: non-null date columns, safe backfill, check constraint, and coverage index.
- Modify `api/prisma/schema.prisma`: canonical availability fields and indexes.
- Modify `api/src/listings/dto.ts`: create/update fields and public query DTO.
- Modify `api/src/listings/listings.controller.ts`: validated public query delegation.
- Modify `api/src/listings/listings.service.ts`: store dates and query with the coverage predicate.
- Modify `api/src/seed-data.ts` and `api/src/seed-los-angeles.ts`: deterministic availability for seeded listings.
- Modify `api/test/listings.service.spec.ts`, `api/test/listings.controller.spec.ts`, and `api/test/listings-validation.e2e.spec.ts`: service and HTTP coverage.
- Modify `lib/api.ts`: listing date types and a query builder for public listing reads.
- Modify `lib/publish-listing.ts`: dates in drafts, validation, mapping, and retry-safe save payloads.
- Modify `lib/date-range.ts`: rental duration language.
- Modify `components/sublet-app.tsx`: server date refetch, enabled picker, host date fields, and truthful roommate buttons.
- Modify `lib/product-capabilities.ts`: authenticated/API-aware roommate messaging capability.
- Modify `tests/date-range.test.ts`, `tests/publish-listing.test.ts`, `tests/product-capabilities.test.ts`, `tests/sublet-app-roommate-chat.test.tsx`, and `tests/sublet-app-auth-state.test.tsx`: frontend behavior.
- Modify `README.md`: current-scope truth.

---

### Task 1: Pure Listing Availability Contract

**Files:**
- Create: `api/src/listings/listing-availability.ts`
- Create: `api/test/listing-availability.spec.ts`

**Interfaces:**
- Produces: `parseListingDate(value: string, field: string): Date`
- Produces: `validateListingAvailability(from: string, to: string): { availableFrom: Date; availableTo: Date }`
- Produces: `buildListingAvailabilityWhere(query: { moveIn?: string; moveOut?: string }): Prisma.ListingWhereInput`

- [ ] **Step 1: Write failing pure tests**

Cover exact boundaries, complete coverage, reversed ranges, impossible calendar dates, wrong formats, and one-sided public query input:

```ts
expect(validateListingAvailability("2026-08-20", "2026-12-31")).toEqual({
  availableFrom: new Date("2026-08-20T00:00:00.000Z"),
  availableTo: new Date("2026-12-31T00:00:00.000Z")
});
expect(() => validateListingAvailability("2026-09-01", "2026-08-31")).toThrow(BadRequestException);
expect(() => buildListingAvailabilityWhere({ moveIn: "2026-08-20" })).toThrow(BadRequestException);
expect(buildListingAvailabilityWhere({ moveIn: "2026-08-20", moveOut: "2026-09-20" })).toEqual({
  availableFrom: { lte: new Date("2026-08-20T00:00:00.000Z") },
  availableTo: { gte: new Date("2026-09-20T00:00:00.000Z") }
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --dir api vitest run test/listing-availability.spec.ts`

Expected: FAIL because `listing-availability.ts` does not exist.

- [ ] **Step 3: Implement strict UTC date validation**

Use an exact `^\d{4}-\d{2}-\d{2}$` check, construct UTC midnight, and round-trip through `toISOString().slice(0, 10)` so values such as `2026-02-30` fail. Throw `BadRequestException` with safe field-specific messages. Return `{}` for a fully empty query and reject a one-sided or reversed query.

- [ ] **Step 4: Run the focused test**

Run: `pnpm --dir api vitest run test/listing-availability.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the pure contract**

```bash
git add api/src/listings/listing-availability.ts api/test/listing-availability.spec.ts
git commit -m "feat: define listing availability contract"
```

### Task 2: Persist Canonical Listing Availability

**Files:**
- Create: `api/prisma/migrations/20260814100000_listing_availability/migration.sql`
- Modify: `api/prisma/schema.prisma`
- Modify: `api/src/seed-data.ts`
- Modify: `api/src/seed-los-angeles.ts`
- Modify: `api/test/production-database-foundations.migration.spec.ts`

**Interfaces:**
- Produces: `Listing.availableFrom: DateTime @db.Date`
- Produces: `Listing.availableTo: DateTime @db.Date`

- [ ] **Step 1: Add a failing schema/migration assertion**

Assert the schema contains the two required date fields and the new migration contains a database constraint named `Listing_availability_order_check`.

- [ ] **Step 2: Run the focused migration test**

Run: `pnpm --dir api vitest run test/production-database-foundations.migration.spec.ts`

Expected: FAIL because the availability migration is absent.

- [ ] **Step 3: Add the migration and Prisma fields**

The migration must use this safe sequence:

```sql
ALTER TABLE "Listing"
  ADD COLUMN "availableFrom" DATE,
  ADD COLUMN "availableTo" DATE;

UPDATE "Listing"
SET "availableFrom" = DATE '2026-08-01',
    "availableTo" = DATE '2027-08-01'
WHERE "availableFrom" IS NULL OR "availableTo" IS NULL;

ALTER TABLE "Listing"
  ALTER COLUMN "availableFrom" SET NOT NULL,
  ALTER COLUMN "availableTo" SET NOT NULL,
  ADD CONSTRAINT "Listing_availability_order_check" CHECK ("availableFrom" < "availableTo");

CREATE INDEX "Listing_status_availableFrom_availableTo_idx"
ON "Listing"("status", "availableFrom", "availableTo");
```

Add the matching Prisma fields/index. Give every `seedListings` entry deterministic dates and pass them through the existing upsert.

- [ ] **Step 4: Generate and validate Prisma**

Run: `pnpm --dir api prisma generate`

Run: `DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate`

Expected: both commands pass.

- [ ] **Step 5: Run the migration test**

Run: `pnpm --dir api vitest run test/production-database-foundations.migration.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit persistence**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814100000_listing_availability/migration.sql api/src/seed-data.ts api/src/seed-los-angeles.ts api/test/production-database-foundations.migration.spec.ts
git commit -m "feat: persist listing availability"
```

### Task 3: Validate And Filter Listing APIs

**Files:**
- Modify: `api/src/listings/dto.ts`
- Modify: `api/src/listings/listings.controller.ts`
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/test/listings.controller.spec.ts`
- Modify: `api/test/listings-validation.e2e.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`

**Interfaces:**
- Produces: `ListingAvailabilityQueryDto { moveIn?: string; moveOut?: string }`
- Changes: `ListingsService.findAll(query?: ListingAvailabilityQueryDto)`
- Changes: create/update DTOs contain `availableFrom` and `availableTo`

- [ ] **Step 1: Add failing service and controller tests**

Assert that `findAll({ moveIn, moveOut })` passes this combined Prisma predicate:

```ts
{
  status: "APPROVED",
  availableFrom: { lte: new Date("2026-08-20T00:00:00.000Z") },
  availableTo: { gte: new Date("2026-09-20T00:00:00.000Z") }
}
```

Assert create/update persist validated UTC dates and controller `findAll(query)` delegates the query unchanged. Add an approved-listing test proving an availability-only edit is allowed and atomically changes status to `SUBMITTED`, refreshes `submittedAt`, and clears prior review metadata; any other owner edit to an approved listing remains rejected.

- [ ] **Step 2: Add failing HTTP tests**

Add requests for valid inclusive coverage and these 400 cases: only `moveIn`, only `moveOut`, reversed dates, malformed dates, create without dates, and create with reversed dates.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `pnpm --dir api vitest run test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts`

Expected: FAIL on missing DTO fields/delegation/filter behavior.

- [ ] **Step 4: Implement DTOs, controller query, and service predicate**

Use `@Query(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, expectedType: ListingAvailabilityQueryDto }))`. Parse create/update dates through `validateListingAvailability`; on partial updates validate the resulting pair against the stored listing. Keep `DRAFT`/`REJECTED` editing unchanged. For `APPROVED`, accept only keys from `{ availableFrom, availableTo }` and write the dates together with `status: "SUBMITTED"`, a fresh `submittedAt`, and cleared `reviewedAt`, `reviewerId`, and `rejectionReason`; reject all other approved edits.

- [ ] **Step 5: Update in-memory test mocks**

Extend listing records, where matching, payload helpers, and launch mocks with real `Date` values. Coverage matching must apply `lte` and `gte`, not merely compare object identity.

- [ ] **Step 6: Run focused tests**

Run: `pnpm --dir api vitest run test/listing-availability.spec.ts test/listings.service.spec.ts test/listings.controller.spec.ts test/listings-validation.e2e.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit API availability**

```bash
git add api/src/listings api/test/listings.service.spec.ts api/test/listings.controller.spec.ts api/test/listings-validation.e2e.spec.ts api/test/support/launch-prisma-mock.ts
git commit -m "feat: filter listings by stay dates"
```

### Task 4: Add Host Availability To The Publish Contract

**Files:**
- Modify: `lib/api.ts`
- Modify: `lib/publish-listing.ts`
- Modify: `tests/publish-listing.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Produces: `buildPublicListingsPath(range: DateRange): string`
- Changes: `PublishDraft` and `ListingDto` require `availableFrom` and `availableTo`

- [ ] **Step 1: Add failing frontend contract tests**

Assert the path builder returns `/listings` for an empty range and `/listings?moveIn=2026-08-20&moveOut=2026-09-20` for a complete range. Assert publish validation rejects blank/reversed availability and mapping sends both fields.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/date-range.test.ts`

Expected: FAIL because publish drafts do not contain dates and the path builder is absent.

- [ ] **Step 3: Implement types, validation, mapping, and restore behavior**

Add the two date strings to `PublishDraft`, `ListingDto`, and `ApiListing`. Validate them in the basic/review steps with the existing ISO comparison helpers. Preserve them across remote draft restore and partial media retry.

- [ ] **Step 4: Add date fields to the host wizard**

In the basic step, render native `type="date"` fields labelled `可入住日期` and `最晚退租日期`. Seed a new draft with `availableFrom: ""` and `availableTo: ""`; do not invent dates in the browser.

- [ ] **Step 5: Run focused frontend tests**

Run: `pnpm vitest run tests/publish-listing.test.ts tests/sublet-app-auth-state.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the host contract**

```bash
git add lib/api.ts lib/publish-listing.ts components/sublet-app.tsx tests/publish-listing.test.ts tests/sublet-app-auth-state.test.tsx
git commit -m "feat: collect listing availability from hosts"
```

### Task 5: Enable Server-Backed Renter Date Search

**Files:**
- Modify: `lib/date-range.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `tests/date-range.test.ts`
- Modify: `tests/sublet-app-auth-state.test.tsx`

**Interfaces:**
- Consumes: `buildPublicListingsPath(range)` from Task 4

- [ ] **Step 1: Add failing label and request tests**

Expect `formatDateRangeLabel({ checkIn: "2026-08-20", checkOut: "2026-09-19" })` to return `8月20日 - 9月19日 · 30 天`. Render the app, select a complete range, and assert the API is requested with the encoded date query. Clearing the range must request `/listings`.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run tests/date-range.test.ts tests/sublet-app-auth-state.test.tsx`

Expected: FAIL on “晚” copy and missing query refetch.

- [ ] **Step 3: Enable the picker and server refetch**

Remove `datesAvailable` as a feature gate: canonical API listings always carry dates after Task 3. Refetch only for an empty or complete range, ignore stale responses with an effect cancellation guard, and keep preview data filtering local. Keep the selected listing valid through `getRequestedListing`.

- [ ] **Step 4: Correct rental language**

Change `晚` to `天`, `搬出` to `退租`, and replace short-stay presets with `一个月` (30), `三个月` (90), and `半年` (180). Remove every `日期筛选暂未开放` label.

- [ ] **Step 5: Run focused frontend tests**

Run: `pnpm vitest run tests/date-range.test.ts tests/listing-catalog.test.ts tests/listing-detail.test.ts tests/sublet-app-auth-state.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit renter date search**

```bash
git add lib/date-range.ts components/sublet-app.tsx tests/date-range.test.ts tests/sublet-app-auth-state.test.tsx tests/listing-detail.test.ts
git commit -m "feat: enable rental date filtering"
```

### Task 6: Remove Stale Roommate Message Gates

**Files:**
- Modify: `lib/product-capabilities.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `tests/product-capabilities.test.ts`
- Modify: `tests/sublet-app-roommate-chat.test.tsx`

**Interfaces:**
- Changes: `roommate-message` is protected/authenticated and API-dependent, not globally unavailable.
- Keeps: conversation existence remains the UI-level mutual-match prerequisite.

- [ ] **Step 1: Add failing capability and rendered-copy tests**

Assert unauthenticated roommate messaging returns `requires-auth`, authenticated/offline returns `api-offline`, and authenticated/online returns `allowed`. Assert rendered reciprocal matches contain `打开室友私信` or `室友私信` without `暂未开放`, while a user without a conversation sees `双方互相喜欢后可私信`.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm vitest run tests/product-capabilities.test.ts tests/sublet-app-roommate-chat.test.tsx`

Expected: FAIL because `roommate-message` is in the unavailable set and stale copy remains.

- [ ] **Step 3: Implement truthful capability and controls**

Move `roommate-message` into `protectedCapabilities`, remove it from `unavailableCapabilities`, call `requireCapability("roommate-message")` before opening a conversation, and derive button disabled/copy state from the returned server conversation. Leave existing send/history/read/realtime code unchanged.

- [ ] **Step 4: Run focused messaging tests**

Run: `pnpm vitest run tests/product-capabilities.test.ts tests/sublet-app-roommate-chat.test.tsx tests/message-inbox.test.ts tests/roommate-conversations.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit roommate-message activation**

```bash
git add lib/product-capabilities.ts components/sublet-app.tsx tests/product-capabilities.test.ts tests/sublet-app-roommate-chat.test.tsx
git commit -m "fix: expose available roommate messaging"
```

### Task 7: Documentation And Release Gate

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: accurate product scope and verification evidence.

- [ ] **Step 1: Update product documentation**

State that canonical listings persist availability, public search performs full-coverage date filtering, host publishing requires dates, and reciprocal roommate messaging is enabled. Keep applications, demo payments, held funds, team confirmation, and MinIO upload listed as the next independent sub-projects.

- [ ] **Step 2: Run frontend verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`

Expected: all commands pass.

- [ ] **Step 3: Run API verification**

Run: `pnpm --dir api test && pnpm --dir api typecheck && pnpm --dir api build`

Expected: all commands pass.

- [ ] **Step 4: Validate Prisma**

Run: `DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate`

Expected: PASS.

- [ ] **Step 5: Commit documentation**

```bash
git add README.md
git commit -m "docs: update availability scope"
```

- [ ] **Step 6: Record clean scoped status**

Run: `git status --short`

Expected: no uncommitted changes from this plan; unrelated pre-existing user files may remain and must not be staged.
