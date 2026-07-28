# Local Core Backend Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the durable local backend and connect the already-upgraded frontend so the host → admin → renter journey uses PostgreSQL-backed state end to end.

**Architecture:** Keep the current Next.js frontend and NestJS/Prisma API. Extend the canonical `User`, `Profile`, `Listing`, `RoommateProfile`, and `DealThread` models, derive all ownership and participant data on the server, and expose only service-backed product state. Preserve device-local storage only for UI preferences and reminders.

**Tech Stack:** Next.js 15, React 19, NestJS 10, Prisma 6, PostgreSQL, Vitest, Supertest, TypeScript.

## Global Constraints

- PostgreSQL is the only business-state source when preview data is disabled.
- Never trust client-supplied owner IDs, sender IDs, participant identity, listing context, review status, or message alignment.
- Resource ownership failures return `404`; invalid transitions return `400`; deal-room binding conflicts return `409`.
- Production authentication remains fail-closed.
- Roommate direct messages, applications, payments, escrow, realtime transport, and production hosting remain out of scope.
- Every behavior change is written test-first and verified before the next task.

---

### Task 1: Persist Authenticated Profiles And Local Administrator Roles

**Files:**
- Modify: `api/src/auth/auth.service.ts`
- Modify: `api/src/config/env.ts`
- Create: `api/src/profiles/profiles.controller.ts`
- Create: `api/src/profiles/profiles.module.ts`
- Create: `api/src/profiles/profiles.service.ts`
- Create: `api/src/profiles/dto.ts`
- Modify: `api/src/app.module.ts`
- Test: `api/test/auth.service.spec.ts`
- Create: `api/test/profiles.service.spec.ts`

**Interfaces:**
- `AuthService.verifyEmailCode(dto)` upserts both `User` and email-linked `Profile`.
- `LOCAL_ADMIN_EMAILS` is a normalized comma-separated allowlist.
- `ProfilesService.findMine(email)` returns the authenticated email-linked profile.
- `ProfilesService.updateMine(email, dto)` updates only the allowed profile fields.

- [ ] **Step 1: Write failing auth tests**

Add cases proving verification creates an email-linked profile, assigns `ADMIN` to allowlisted emails, and never demotes an existing administrator.

- [ ] **Step 2: Run auth tests and verify RED**

Run: `pnpm --dir api test -- auth.service.spec.ts`

Expected: FAIL because profile upsert and allowlist assignment are absent.

- [ ] **Step 3: Implement auth profile upsert and allowlist parsing**

Normalize `LOCAL_ADMIN_EMAILS` with `split(",").map(normalizeEmail).filter(Boolean)`. Upsert the profile by email and set `User.role` to `ADMIN` only for allowlisted users or existing administrators.

- [ ] **Step 4: Write failing profile service tests**

Cover authenticated read, allowed updates, missing profile behavior, and trimming of display fields.

- [ ] **Step 5: Implement profiles module**

Expose authenticated `GET /api/v1/profiles/me` and `PATCH /api/v1/profiles/me`. DTO fields are `displayName`, `avatarUrl`, `school`, `city`, `role`, `wechat`, `instagram`, and `bio`; unknown fields are rejected.

- [ ] **Step 6: Verify and commit**

Run: `pnpm --dir api test -- auth.service.spec.ts profiles.service.spec.ts && pnpm --dir api typecheck`

Commit: `feat: persist authenticated profiles and local admin roles`

### Task 2: Remove Business Seed Fallbacks And Make Roommate Matching Authoritative

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/<timestamp>_local_core_backend/migration.sql`
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/src/roommates/roommates.service.ts`
- Modify: `api/src/deal-rooms/deal-rooms.service.ts`
- Modify: `api/src/seed-los-angeles.ts`
- Test: `api/test/listings.service.spec.ts`
- Test: `api/test/seed-backed-read-endpoints.spec.ts`
- Test: `api/test/match-transaction-flow.spec.ts`

**Interfaces:**
- `ListingsService.findAll()` returns only approved database records and may return `[]`.
- `RoommatesService.findAll()` returns database candidates without internal reciprocal flags and may return `[]`.
- `RoommateProfile.localReciprocalLike` is server-owned and never serialized publicly.
- `recordAction()` always persists the action and creates a deal room only for reciprocal `LIKE`.

- [ ] **Step 1: Write failing empty-table and roommate-response tests**

Assert empty listing and roommate tables return empty arrays, and roommate payloads omit `localReciprocalLike`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --dir api test -- listings.service.spec.ts seed-backed-read-endpoints.spec.ts match-transaction-flow.spec.ts`

- [ ] **Step 3: Add reciprocal field migration and remove fallbacks**

Add `localReciprocalLike Boolean @default(false)` to `RoommateProfile`. Remove `seedListings` and `seedRoommates` read fallbacks. Map roommate responses through an explicit public serializer.

- [ ] **Step 4: Write failing reciprocal-action tests**

Prove pending likes return `{ dealRoom: null }`, reciprocal likes create one active room, and repeated likes do not duplicate actions, rooms, or members.

- [ ] **Step 5: Implement authoritative roommate action handling**

Read the candidate before recording the action. Persist `PASS` and `LATER` without rooms. For `LIKE`, call deal-room creation only when the server-owned reciprocal flag is true.

- [ ] **Step 6: Update deterministic local seed and verify**

Seed at least one reciprocal and one non-reciprocal candidate. Run the focused tests, Prisma validation, and typecheck.

- [ ] **Step 7: Commit**

Commit: `feat: use database-backed catalog and roommate matching`

### Task 3: Make Listing Conversations Two-Sided And Server-Derived

**Files:**
- Modify: `api/prisma/schema.prisma`
- Modify: `api/prisma/migrations/<timestamp>_local_core_backend/migration.sql`
- Modify: `api/src/deal-threads/dto.ts`
- Modify: `api/src/deal-threads/deal-threads.service.ts`
- Modify: `api/test/deal-threads.service.spec.ts`
- Modify: `api/test/deal-threads.e2e.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`
- Modify: `lib/api.ts`

**Interfaces:**
- `DealThread.listingId` is a required relation to `Listing`.
- `DealThread.listingOwnerId` is derived from the listing and indexed with `updatedAt`.
- `CreateDealThreadDto` accepts only `listingId` and optional `dealRoomId`.
- `findForUser(userId)` returns renter-owned or listing-owner threads with `viewerRole`, viewer-relative `contactName`, and viewer-relative message alignment.

- [ ] **Step 1: Write failing service tests**

Cover server-derived listing context, renter/host visibility, third-party denial, viewer-relative alignment, and conflicting deal-room bindings.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --dir api test -- deal-threads.service.spec.ts deal-threads.e2e.spec.ts`

- [ ] **Step 3: Add listing and host relations**

Add the listing relation and required `listingOwnerId`. Update test mocks and the migration. The migration must fail on incompatible legacy development threads rather than fabricate ownership.

- [ ] **Step 4: Narrow the creation DTO and derive context**

Load an approved listing, use its title/area/owner, derive profile display names by email, validate any selected active deal room, and return `409` if an existing thread is already bound to a different room.

- [ ] **Step 5: Implement participant authorization and serialization**

Authorize the renter or listing owner for reads and messages. Store the real sender ID/name. Derive `align` and `status` relative to the viewer.

- [ ] **Step 6: Update frontend API types and verify**

Change `CreateDealThreadInput` to `{ listingId, dealRoomId? }` and add `viewerRole: "renter" | "host"` to `ApiDealThread`. Run API and frontend tests plus both typechecks.

- [ ] **Step 7: Commit**

Commit: `feat: support two-sided listing conversations`

### Task 4: Add Host Viewing Decisions

**Files:**
- Modify: `api/src/deal-threads/deal-threads.controller.ts`
- Modify: `api/src/deal-threads/deal-threads.service.ts`
- Modify: `api/test/deal-threads.service.spec.ts`
- Modify: `api/test/deal-threads.e2e.spec.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- `confirmViewingRequest(hostId, threadId, requestId)` moves `REQUESTED` to `CONFIRMED`.
- `declineViewingRequest(hostId, threadId, requestId)` moves `REQUESTED` or `CONFIRMED` to `CANCELLED`.
- Only the listing owner can call either route.

- [ ] **Step 1: Write failing transition tests**

Cover confirm, decline, renter denial, unrelated host denial, missing request, confirm-from-confirmed, and decline-from-cancelled.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm --dir api test -- deal-threads.service.spec.ts deal-threads.e2e.spec.ts`

- [ ] **Step 3: Implement service transitions**

Load the thread with listing ownership and request membership. Return `404` for unauthorized access and `400` for invalid transitions. Write a system-visible conversation message after a successful host decision.

- [ ] **Step 4: Expose HTTP routes**

Add:

```text
POST /api/v1/deal-threads/:threadId/viewing-requests/:requestId/confirm
POST /api/v1/deal-threads/:threadId/viewing-requests/:requestId/decline
```

- [ ] **Step 5: Wire frontend controls and verify**

Keep request and draft state unchanged on failure; refresh the selected thread after success. Run focused API tests, frontend tests, lint, and typechecks.

- [ ] **Step 6: Commit**

Commit: `feat: add host viewing decisions`

### Task 5: Complete Local Setup, End-To-End Coverage, And Product Verification

**Files:**
- Modify: `package.json`
- Modify: `api/package.json`
- Modify: `docker-compose.yml`
- Modify: `api/.env.example`
- Modify: `README.md`
- Modify: `api/src/seed-los-angeles.ts`
- Modify: `api/test/http-launch-readiness.e2e.spec.ts`
- Modify: `api/test/launch-smoke.spec.ts`
- Verify: `components/sublet-app.tsx`
- Verify: `tests/*.test.ts`

**Interfaces:**
- Root `local:setup` starts PostgreSQL, waits for readiness, applies committed migrations, and runs the idempotent seed.
- Root `dev:local` runs web on `3000` and API on `4000`.
- Frontend preview data remains disabled unless explicitly enabled by the preview environment flag.

- [ ] **Step 1: Write the failing HTTP journey**

Use host, admin, renter, and unrelated-user tokens to prove listing submit/approve/public read, two-sided messaging, viewing request/confirm, authorization denial, and pending versus reciprocal roommate likes.

- [ ] **Step 2: Run the HTTP journey and verify RED**

Run: `pnpm --dir api test -- http-launch-readiness.e2e.spec.ts`

- [ ] **Step 3: Implement setup and development scripts**

Use the repository Compose service, `prisma migrate deploy`, and the idempotent seed command. Do not reset or truncate an arbitrary external database.

- [ ] **Step 4: Make the HTTP journey pass**

Fix only contract mismatches exposed by the journey. Keep all server-owned identity and transition rules intact.

- [ ] **Step 5: Run full verification**

Run:

```text
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
pnpm --dir api prisma validate
```

If Docker is available, also run `local:setup` and the opt-in real PostgreSQL smoke test.

- [ ] **Step 6: Commit**

Commit: `feat: complete durable local product environment`
