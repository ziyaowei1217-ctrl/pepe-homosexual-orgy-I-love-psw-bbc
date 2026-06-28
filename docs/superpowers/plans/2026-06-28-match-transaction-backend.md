# Match Transaction Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the roommate Match -> Deal Room -> Group Tour backend loop.

**Architecture:** Add Prisma models for roommate actions, deal rooms, deal-room members, and tour requests. Implement focused NestJS services behind authenticated controllers, keeping deterministic snapshot generation inside the service layer for this first commercial backend slice.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, class-validator, Vitest, TypeScript.

---

## File Structure

- Modify `api/prisma/schema.prisma`: add enums, models, relations, unique constraints, and indexes.
- Create `api/src/roommates/dto.ts`: validate `LIKE | PASS | LATER` action requests.
- Modify `api/src/roommates/roommates.controller.ts`: add authenticated `POST /roommates/:id/actions`.
- Create `api/src/roommates/roommates.service.ts`: read seed/database roommates and delegate user actions to deal rooms.
- Modify `api/src/roommates/roommates.module.ts`: register service.
- Create `api/src/deal-rooms/deal-rooms.controller.ts`: add active-room and tour-request endpoints.
- Create `api/src/deal-rooms/deal-rooms.service.ts`: own action upsert, deal-room creation, and tour-request idempotency.
- Create `api/src/deal-rooms/deal-rooms.module.ts`: register controller/service.
- Modify `api/src/app.module.ts`: import `DealRoomsModule`.
- Modify `api/src/seed-data.ts`: align backend seed listings with Boston market.
- Create `api/test/deal-rooms.service.spec.ts`: TDD coverage for the matching transaction loop.

## Task 1: Deal Room Service Red Tests

**Files:**
- Create: `api/test/deal-rooms.service.spec.ts`

- [ ] **Step 1: Write failing service tests**

Create tests for:

```ts
it("likes a roommate and creates an active deal room", async () => {});
it("returns the existing deal room when liking the same roommate twice", async () => {});
it("does not create a deal room for pass or later actions", async () => {});
it("creates a tour request for an owned deal room idempotently", async () => {});
it("rejects tour requests for deal rooms owned by another user", async () => {});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
pnpm --dir api test -- deal-rooms.service.spec.ts
```

Expected: fail because `DealRoomsService` does not exist.

## Task 2: Prisma Schema

**Files:**
- Modify: `api/prisma/schema.prisma`

- [ ] **Step 1: Add enums and models**

Add:

```prisma
enum RoommateActionType {
  LIKE
  PASS
  LATER
}

enum DealRoomStatus {
  ACTIVE
  ARCHIVED
}

enum TourRequestStatus {
  REQUESTED
  SCHEDULED
  CANCELLED
}
```

Add models `RoommateAction`, `DealRoom`, `DealRoomMember`, and `TourRequest` with the unique constraints and indexes from the spec.

- [ ] **Step 2: Validate Prisma schema**

Run:

```bash
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

Expected: schema is valid.

## Task 3: Deal Room Service Green Implementation

**Files:**
- Create: `api/src/deal-rooms/deal-rooms.service.ts`
- Create: `api/src/deal-rooms/deal-rooms.module.ts`

- [ ] **Step 1: Implement `recordRoommateAction`**

Implement action upsert by `(userId, roommateProfileId)`. For `LIKE`, create or return an active deal room with one member snapshot and recommended homes snapshot. For `PASS` and `LATER`, return `dealRoom: null`.

- [ ] **Step 2: Implement `findActiveForUser`**

Return active deal rooms owned by the user ordered by `updatedAt desc`, including members and tour request.

- [ ] **Step 3: Implement `requestGroupTour`**

Find an owned deal room by `id` and `ownerId`; if absent, throw `NotFoundException`. Upsert one `TourRequest` by `dealRoomId`.

- [ ] **Step 4: Run service tests**

Run:

```bash
pnpm --dir api test -- deal-rooms.service.spec.ts
```

Expected: tests pass.

## Task 4: Roommates API Wiring

**Files:**
- Create: `api/src/roommates/dto.ts`
- Create: `api/src/roommates/roommates.service.ts`
- Modify: `api/src/roommates/roommates.controller.ts`
- Modify: `api/src/roommates/roommates.module.ts`

- [ ] **Step 1: Add DTO**

Create `RoommateActionDto` with `@IsEnum(RoommateActionType)`.

- [ ] **Step 2: Move read behavior into service**

Move seed/database roommate reads into `RoommatesService.findAll()`.

- [ ] **Step 3: Add authenticated action endpoint**

Add `POST /roommates/:id/actions`, guarded by `AuthGuard`, calling `DealRoomsService.recordRoommateAction()`.

- [ ] **Step 4: Run API tests and typecheck**

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
```

Expected: all tests and TypeScript pass.

## Task 5: Deal Rooms API Wiring

**Files:**
- Create: `api/src/deal-rooms/deal-rooms.controller.ts`
- Modify: `api/src/deal-rooms/deal-rooms.module.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: Add controller**

Add:

- `GET /deal-rooms/active`
- `POST /deal-rooms/:id/tour-requests`

Both require `AuthGuard`.

- [ ] **Step 2: Register module**

Import `DealRoomsModule` in `AppModule`.

- [ ] **Step 3: Run backend verification**

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
```

Expected: all pass.

## Task 6: Seed Data Commercial Consistency

**Files:**
- Modify: `api/src/seed-data.ts`

- [ ] **Step 1: Align backend seed listings**

Replace the NYC seed listing with the Boston Allston listing used by the frontend.

- [ ] **Step 2: Run backend verification**

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
```

Expected: all pass.

## Final Verification

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
git status --short
```

Expected:

- Vitest passes.
- TypeScript passes.
- Nest build passes.
- Prisma schema validates.
- Only intentional files are changed before commit.
