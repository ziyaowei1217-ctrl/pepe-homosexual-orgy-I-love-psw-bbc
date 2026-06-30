# Seed-Backed Read Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `groups`, `trips`, and `trust/queues` read endpoints use existing Prisma tables before falling back to seed data.

**Architecture:** Add one service per endpoint domain, keep controllers thin, and preserve seed fallback only for empty result sets. Extend the launch Prisma mock so existing HTTP tests can continue loading these endpoints without a real database.

**Tech Stack:** NestJS controllers/services/modules, Prisma-style mocks, Vitest, TypeScript.

---

## File Structure

- Create `api/src/groups/groups.service.ts`: database-first group reads with seed fallback.
- Modify `api/src/groups/groups.controller.ts`: delegate to `GroupsService`.
- Modify `api/src/groups/groups.module.ts`: register `GroupsService`.
- Create `api/src/trips/trips.service.ts`: database-first booking reads with seed fallback.
- Modify `api/src/trips/trips.controller.ts`: delegate to `TripsService`.
- Modify `api/src/trips/trips.module.ts`: register `TripsService`.
- Create `api/src/trust/trust.service.ts`: database-first trust queue reads with seed fallback.
- Modify `api/src/trust/trust.controller.ts`: delegate to `TrustService`.
- Modify `api/src/trust/trust.module.ts`: register `TrustService`.
- Create `api/test/seed-backed-read-endpoints.spec.ts`: service and controller tests.
- Modify `api/test/support/launch-prisma-mock.ts`: add group, booking, and trust queue item findMany support.

## Task 1: Write Failing Tests

- [ ] **Step 1: Add service and controller tests**

Create `api/test/seed-backed-read-endpoints.spec.ts` with tests for:

- `GroupsService.findAll()` returns database groups and calls `orderBy.createdAt = "desc"`.
- `GroupsService.findAll()` returns `seedGroups` when no rows exist.
- `GroupsController.findAll()` delegates to the service.
- `TripsService.findAll()` returns database bookings and calls `orderBy.createdAt = "desc"`.
- `TripsService.findAll()` returns `seedTrips` when no rows exist.
- `TripsController.findAll()` delegates to the service.
- `TrustService.queues()` returns database queue rows and calls `orderBy.updatedAt = "desc"`.
- `TrustService.queues()` returns `seedTrustQueues` when no rows exist.
- `TrustController.queues()` delegates to the service.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/seed-backed-read-endpoints.spec.ts
```

Expected: fails because the service files do not exist yet.

## Task 2: Implement Services And Module Wiring

- [ ] **Step 1: Add services**

Create the three services with `PrismaService` injection and seed fallback.

- [ ] **Step 2: Update controllers**

Replace direct seed imports with service delegation.

- [ ] **Step 3: Update modules**

Add each service to its module `providers` array.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/seed-backed-read-endpoints.spec.ts
```

Expected: tests pass.

## Task 3: Preserve HTTP Launch Coverage

- [ ] **Step 1: Extend launch Prisma mock**

Add `group.findMany`, `booking.findMany`, and `trustQueueItem.findMany` to `api/test/support/launch-prisma-mock.ts`, returning empty arrays by default.

- [ ] **Step 2: Run HTTP launch tests**

Run:

```bash
./node_modules/.bin/vitest run test/http-launch-readiness.e2e.spec.ts test/listings-validation.e2e.spec.ts test/auth-validation.e2e.spec.ts
```

Expected: tests pass without a real database.

## Task 4: Launch Verification And Commit

- [ ] **Step 1: Run full API launch check**

Run:

```bash
npm run launch:check
```

Expected: tests, typecheck, build, and Prisma validate pass.

- [ ] **Step 2: Run real database smoke when PostgreSQL is available**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: smoke test passes against Docker Postgres.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add api/src/groups/groups.controller.ts api/src/groups/groups.module.ts api/src/groups/groups.service.ts api/src/trips/trips.controller.ts api/src/trips/trips.module.ts api/src/trips/trips.service.ts api/src/trust/trust.controller.ts api/src/trust/trust.module.ts api/src/trust/trust.service.ts api/test/seed-backed-read-endpoints.spec.ts api/test/support/launch-prisma-mock.ts docs/superpowers/specs/2026-06-30-seed-backed-read-endpoints-design.md docs/superpowers/plans/2026-06-30-seed-backed-read-endpoints.md
git commit -m "feat: persist seed-backed read endpoints"
```
