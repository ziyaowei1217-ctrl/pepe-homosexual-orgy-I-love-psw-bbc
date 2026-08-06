# Legacy Housing Listing Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire every public `/api/v1/housing-listings` route with a stable HTTP 410 contract, remove the obsolete application read/write path, and preserve the underlying PostgreSQL table as a readable but write-protected archive.

**Architecture:** Keep `HousingListing` in the Prisma schema so operators and future migrations can identify archived rows, and keep the existing database trigger that rejects `INSERT`, `UPDATE`, and `DELETE`. Replace the NestJS controller's legacy handlers with two catch-all handlers that always throw the same `GoneException`, then delete the unreachable legacy DTO and service code. The current `/api/v1/listings` module remains the only supported listing API.

**Tech Stack:** Node.js 22, pnpm 9, NestJS 10, Prisma 6, PostgreSQL 16, TypeScript 5.7, Vitest 2, Supertest.

## Global Constraints

- Do not modify any existing Prisma migration.
- Do not drop, truncate, rewrite, or delete rows from the lower-case legacy `listings` table.
- Every supported legacy collection or item request returns HTTP 410 with code `LEGACY_LISTINGS_RETIRED` and replacement `/api/v1/listings`.
- The retirement response is public and deterministic; authentication state, route parameters, query strings, and request bodies must not change it.
- The application must no longer expose a service method or DTO capable of writing the legacy table.
- Preserve all profile and roommate-profile behavior in `MarketplaceModule`.
- Keep unrelated user changes and generated presentation/chart files untouched.

---

## File Structure

- Modify `api/src/marketplace/marketplace.controller.ts`: replace legacy collection/item handlers with deterministic 410 handlers while leaving profile and roommate-profile routes unchanged.
- Modify `api/src/marketplace/marketplace.service.ts`: remove the obsolete housing-listing methods and their data mappers.
- Modify `api/src/marketplace/dto.ts`: remove housing-listing-only DTOs, constants, decorators, and imports.
- Modify `api/test/marketplace-api.e2e.spec.ts`: replace the old successful legacy CRUD flow with HTTP retirement-contract coverage.
- Delete `api/test/marketplace.service.spec.ts`: remove tests for application behavior that must no longer exist.
- Modify `README.md`: document the 410 migration contract and the supported replacement API.

### Task 1: Replace Legacy HTTP Routes With a Stable 410 Contract

**Files:**
- Modify: `api/test/marketplace-api.e2e.spec.ts`
- Modify: `api/src/marketplace/marketplace.controller.ts`
- Test: `api/test/marketplace-api.e2e.spec.ts`

**Interfaces:**
- Produces: `legacyListingsRetired(): never`.
- Produces: collection handler `HousingListingsController.retiredCollection(): never` for `/housing-listings`.
- Produces: item handler `HousingListingsController.retiredItem(): never` for `/housing-listings/:id`.
- Produces error body `{ statusCode: 410, code: "LEGACY_LISTINGS_RETIRED", message: "Legacy housing listings API has been retired", replacement: "/api/v1/listings" }`.

- [ ] **Step 1: Replace the successful legacy CRUD e2e case with a failing retirement-contract test**

In `api/test/marketplace-api.e2e.spec.ts`, replace the test named `stores housing listings, exposes only active public listings, and enforces owner updates` with:

```ts
it("retires every legacy housing-listing collection and item operation", async () => {
  const http = request(app.getHttpServer());
  const expected = {
    statusCode: 410,
    code: "LEGACY_LISTINGS_RETIRED",
    message: "Legacy housing listings API has been retired",
    replacement: "/api/v1/listings"
  };
  const requests = [
    http.get("/api/v1/housing-listings?city=LA"),
    http.post("/api/v1/housing-listings").set("Authorization", `Bearer ${token}`).send(housingListingPayload()),
    http.put("/api/v1/housing-listings/legacy-id").send({ title: "ignored" }),
    http.patch("/api/v1/housing-listings/legacy-id").set("Authorization", `Bearer ${token}`).send({ status: "active" }),
    http.delete("/api/v1/housing-listings/legacy-id")
  ];

  for (const pending of requests) {
    await pending.expect(410).expect(expected);
  }
});
```

Keep `housingListingPayload()` until Task 2 so this test compiles during the RED run.

- [ ] **Step 2: Run the focused e2e test and verify RED**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/marketplace-api.e2e.spec.ts
```

Expected: FAIL because the current GET/POST/PATCH handlers return successful legacy responses and PUT/DELETE do not return the retirement error.

- [ ] **Step 3: Replace the legacy controller methods with collection and item catch-all handlers**

In `api/src/marketplace/marketplace.controller.ts`, import `All` and `GoneException`, remove the legacy DTO imports and legacy validation pipes, then replace the current `HousingListingsController` with:

```ts
@Controller("housing-listings")
export class HousingListingsController {
  @All()
  retiredCollection(): never {
    return legacyListingsRetired();
  }

  @All(":id")
  retiredItem(): never {
    return legacyListingsRetired();
  }
}

function legacyListingsRetired(): never {
  throw new GoneException({
    statusCode: 410,
    code: "LEGACY_LISTINGS_RETIRED",
    message: "Legacy housing listings API has been retired",
    replacement: "/api/v1/listings"
  });
}
```

Do not attach `AuthGuard`: callers must receive the migration contract instead of a 401 response.

- [ ] **Step 4: Run the focused e2e test and verify GREEN**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/marketplace-api.e2e.spec.ts
```

Expected: PASS with GET, POST, PUT, PATCH, and DELETE returning the exact 410 body.

- [ ] **Step 5: Commit the HTTP retirement boundary**

```bash
git add api/src/marketplace/marketplace.controller.ts api/test/marketplace-api.e2e.spec.ts
git commit -m "fix: retire legacy housing listing routes"
```

### Task 2: Remove the Obsolete Application Read/Write Surface

**Files:**
- Modify: `api/src/marketplace/marketplace.service.ts`
- Modify: `api/src/marketplace/dto.ts`
- Modify: `api/test/marketplace-api.e2e.spec.ts`
- Delete: `api/test/marketplace.service.spec.ts`
- Test: `api/test/marketplace-api.e2e.spec.ts`

**Interfaces:**
- Removes: `MarketplaceService.createHousingListing(email, dto)`.
- Removes: `MarketplaceService.findHousingListings(query)`.
- Removes: `MarketplaceService.findHousingListing(id)`.
- Removes: `MarketplaceService.updateHousingListing(email, id, dto)`.
- Removes: `CreateHousingListingDto` and `UpdateHousingListingDto`.
- Preserves: every profile and roommate-profile method and DTO.

- [ ] **Step 1: Add a source regression that forbids legacy Prisma calls from the marketplace service**

Add this non-database test to `api/test/marketplace-api.e2e.spec.ts`:

```ts
it("does not expose legacy housing-listing operations through MarketplaceService", async () => {
  const service = app.get(MarketplaceService) as MarketplaceService & Record<string, unknown>;

  expect(service.createHousingListing).toBeUndefined();
  expect(service.findHousingListings).toBeUndefined();
  expect(service.findHousingListing).toBeUndefined();
  expect(service.updateHousingListing).toBeUndefined();
});
```

Import `MarketplaceService` from `../src/marketplace/marketplace.service`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/marketplace-api.e2e.spec.ts
```

Expected: FAIL because all four legacy service methods still exist.

- [ ] **Step 3: Delete the legacy service methods and mapping helpers**

In `api/src/marketplace/marketplace.service.ts`:

- remove `CreateHousingListingDto` and `UpdateHousingListingDto` from imports;
- remove `createHousingListing`, `findHousingListings`, `findHousingListing`, and `updateHousingListing`;
- remove `housingListingData(dto)` and `housingListingUpdateData(dto)`;
- keep `definedData()` because the active roommate-profile queries use it;
- keep `requirePublishCapableProfile` if active roommate/profile code still imports it, otherwise remove only that now-unused import.

Do not remove the Prisma `HousingListing` model or alter archived rows.

- [ ] **Step 4: Delete housing-listing-only DTO definitions and imports**

In `api/src/marketplace/dto.ts`:

- delete `CreateHousingListingDto`, `PartialCreateHousingListingDto`, and `UpdateHousingListingDto`;
- delete `listingTypes`, `propertyTypes`, and `listingStatuses`;
- remove `IsBoolean` only if no remaining DTO uses it;
- preserve `roomTypes`, because the roommate profile API still uses it;
- preserve shared validation constants and decorators used by profile or roommate-profile DTOs.

Delete `api/test/marketplace.service.spec.ts`; the file tests only the legacy service contract that is being intentionally removed.

- [ ] **Step 5: Remove the now-unused legacy payload fixture from the e2e test**

Delete `housingListingPayload()` from `api/test/marketplace-api.e2e.spec.ts` after confirming no active test calls it. In the 410 POST request, send a minimal ignored object instead:

```ts
http.post("/api/v1/housing-listings").set("Authorization", `Bearer ${token}`).send({ ignored: true })
```

This proves retirement occurs before request-body validation.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm --filter sublet-pipeline-api test -- test/marketplace-api.e2e.spec.ts
pnpm --filter sublet-pipeline-api typecheck
```

Expected: the retirement e2e suite passes and TypeScript reports no dangling legacy imports or helpers.

- [ ] **Step 7: Commit the dead application surface removal**

```bash
git add api/src/marketplace/marketplace.service.ts api/src/marketplace/dto.ts api/test/marketplace-api.e2e.spec.ts api/test/marketplace.service.spec.ts
git commit -m "refactor: remove legacy housing listing writes"
```

### Task 3: Document and Verify the Archive Boundary

**Files:**
- Modify: `README.md`
- Verify: `api/prisma/migrations/20260803120000_production_database_foundations/migration.sql`
- Test: `api/test/production-database-foundations.migration.spec.ts`
- Test: all API tests and build checks.

**Interfaces:**
- Preserves database reads from the lower-case `listings` archive.
- Preserves database rejection of `INSERT`, `UPDATE`, and `DELETE` through trigger `listings_read_only`.
- Documents `/api/v1/listings` as the supported replacement.

- [ ] **Step 1: Confirm the existing additive migration already protects the archive**

Read `api/prisma/migrations/20260803120000_production_database_foundations/migration.sql` and verify it contains all of:

```sql
CREATE FUNCTION "reject_legacy_listings_mutation"()
CREATE TRIGGER "listings_read_only"
BEFORE INSERT OR UPDATE OR DELETE ON "listings"
```

Do not edit the migration. `api/test/production-database-foundations.migration.spec.ts` already inserts an archived row before the trigger, reads it after migration, and asserts that later insert, update, and delete statements fail with `read-only`.

- [ ] **Step 2: Update the README migration contract**

Add this paragraph near the listing API documentation:

```md
The former `/api/v1/housing-listings` API is retired. Collection and item requests return HTTP 410 with `LEGACY_LISTINGS_RETIRED` and point clients to `/api/v1/listings`. The old PostgreSQL table remains available only as a write-protected archive; new application code must not read from or write to it.
```

Update the current-scope wording so it no longer implies that both listing models are active.

- [ ] **Step 3: Run the complete API verification**

Run:

```bash
pnpm --filter sublet-pipeline-api test
pnpm --filter sublet-pipeline-api typecheck
pnpm --filter sublet-pipeline-api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

Expected: all ordinary tests pass, database-gated tests remain explicitly skipped unless `RUN_DB_SMOKE=1`, typecheck/build succeed, and Prisma validates the unchanged archive model.

- [ ] **Step 4: Run the PostgreSQL 16 migration smoke test when the local database container is available**

Run:

```bash
RUN_DB_SMOKE=1 pnpm --filter sublet-pipeline-api test -- test/production-database-foundations.migration.spec.ts
```

Expected: the archived row remains readable, application-style insert/update/delete attempts are rejected, and every migration is recorded successfully. If Docker or the named PostgreSQL container is unavailable, report this as an environment-gated verification rather than weakening or deleting the test.

- [ ] **Step 5: Commit the archive documentation**

```bash
git add README.md
git commit -m "docs: document retired listing archive"
```

## Plan Self-Review

- Specification coverage: covers the design's complete legacy API retirement and existing database write-protection requirements; secure media upload/processing and publish/suspend behavior remain separate follow-on backend plans.
- Placeholder scan: every implementation and verification step contains concrete code, commands, and expected outcomes.
- Type consistency: controller methods, exception body, service method removals, DTO removals, tests, and documentation all use the same legacy route and stable error code.
- Scope: one independently deployable subproject; no R2 credentials, image library, frontend change, or production hosting decision is required.
