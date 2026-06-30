# Deal Room Recommendation Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent deal-room home recommendations from exposing non-approved database listings.

**Architecture:** Keep the existing recommendation scoring and seed fallback. Change only the listing query used by `DealRoomsService.buildRecommendedHomes()` so database homes are limited to `status: "APPROVED"`, then prove the behavior with focused service tests.

**Tech Stack:** NestJS service layer, Prisma-style mocks, Vitest, TypeScript.

---

## File Structure

- Modify `api/test/deal-rooms.service.spec.ts`: add listing status-aware mock support and recommendation visibility tests.
- Modify `api/src/deal-rooms/deal-rooms.service.ts`: query only approved listings for recommendations.

## Task 1: Recommendation Visibility Tests

**Files:**
- Modify: `api/test/deal-rooms.service.spec.ts`

- [ ] **Step 1: Add failing service tests**

Add tests to `api/test/deal-rooms.service.spec.ts`:

```ts
it("recommends only approved database listings when creating a deal room", async () => {
  const prisma = createPrismaMock({
    listings: [
      listingRecord({ id: "draft-listing", status: "DRAFT", score: 5 }),
      listingRecord({ id: "approved-listing", status: "APPROVED", score: 4.5 })
    ]
  });
  const service = new DealRoomsService(prisma as never);

  const result = await service.recordRoommateAction({
    userId: "user-1",
    roommateProfileId: "roommate-1",
    action: "LIKE"
  });

  expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
  expect(result.dealRoom?.recommendedHomes).toMatchObject([{ id: "approved-listing" }]);
  expect(JSON.stringify(result.dealRoom?.recommendedHomes)).not.toContain("draft-listing");
});

it("keeps seed fallback when no approved database listings exist", async () => {
  const prisma = createPrismaMock({
    listings: [listingRecord({ id: "draft-listing", status: "DRAFT" })]
  });
  const service = new DealRoomsService(prisma as never);

  const result = await service.recordRoommateAction({
    userId: "user-1",
    roommateProfileId: "roommate-1",
    action: "LIKE"
  });

  expect(prisma.listing.findManyCalls[0].where).toEqual({ status: "APPROVED" });
  expect(result.dealRoom?.recommendedHomes).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: expect.stringMatching(/^seed-/) })])
  );
});
```

Also update the local mock types and helpers:

```ts
type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
```

Add `status: ListingStatus` to `ListingRecord`.

Add helper:

```ts
function listingRecord(overrides: Partial<ListingRecord> = {}): ListingRecord {
  return {
    id: "listing-1",
    title: "Fenway verified sublet",
    area: "Boston - Fenway",
    image: "https://example.com/home.jpg",
    price: 1420,
    originalPrice: 1680,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes to Back Bay",
    trust: ".edu verified",
    tags: ["Group friendly", "video tour"],
    score: 4.92,
    status: "APPROVED",
    ...overrides
  };
}
```

Change `createPrismaMock()` to accept listings:

```ts
function createPrismaMock({ listings = [listingRecord()] }: { listings?: ListingRecord[] } = {}) {
```

Track `findMany` calls:

```ts
findManyCalls: [] as Array<{ where?: { status?: ListingStatus }; orderBy?: { score?: "asc" | "desc" }; take?: number }>,
findMany: async (args: { where?: { status?: ListingStatus }; orderBy?: { score?: "asc" | "desc" }; take?: number } = {}) => {
  mock.listing.findManyCalls.push(args);
  const filtered = listings.filter((listing) => !args.where?.status || listing.status === args.where.status);
  const sorted = [...filtered].sort((a, b) => args.orderBy?.score === "desc" ? b.score - a.score : 0);
  return typeof args.take === "number" ? sorted.slice(0, args.take) : sorted;
}
```

- [ ] **Step 2: Run tests to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/deal-rooms.service.spec.ts
```

Expected: the new approved-only test fails because `DealRoomsService` does not pass `where: { status: "APPROVED" }` yet.

## Task 2: Approved-Only Query

**Files:**
- Modify: `api/src/deal-rooms/deal-rooms.service.ts`

- [ ] **Step 1: Add approved status filter**

Update `buildRecommendedHomes()`:

```ts
const records = await this.prisma.listing.findMany({
  where: {
    status: "APPROVED"
  },
  orderBy: {
    score: "desc"
  },
  take: 6
});
```

- [ ] **Step 2: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/deal-rooms.service.spec.ts test/http-launch-readiness.e2e.spec.ts test/launch-smoke.spec.ts
```

Expected: focused service and launch-readiness tests pass; launch smoke remains skipped unless `RUN_DB_SMOKE=1`.

## Task 3: Launch Verification

**Files:**
- No additional files beyond previous tasks.

- [ ] **Step 1: Run full launch check**

Run from `api`:

```bash
npm run launch:check
```

Expected: tests, typecheck, build, and Prisma validate pass.

- [ ] **Step 2: Run real-Postgres smoke**

Run from `api`:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: launch smoke test passes against Docker Postgres.

- [ ] **Step 3: Commit implementation**

Run from repository root:

```bash
git add api/src/deal-rooms/deal-rooms.service.ts api/test/deal-rooms.service.spec.ts docs/superpowers/specs/2026-06-30-deal-room-recommendation-visibility-design.md docs/superpowers/plans/2026-06-30-deal-room-recommendation-visibility.md
git commit -m "feat: limit deal room recommendations to approved listings"
```
