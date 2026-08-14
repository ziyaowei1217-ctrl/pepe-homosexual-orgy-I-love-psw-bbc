# Online Rental Applications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a renter submit one persistent solo or confirmed-team application for an approved listing, let only that listing's owner decide it, and expose the result to both sides after refresh.

**Architecture:** The applications module owns application input, immutable applicant snapshots, availability checks, viewer authorization, and the application state machine. It stores an `activeKey` so PostgreSQL permits only one non-terminal application per listing and applicant scope, plus an `acceptedListingKey` so one listing cannot have two unfinished accepted applications. Acceptance and cancellation call the narrow demo-payments transaction API defined in the demo-payments plan so payment-order creation and held-fund refunds remain atomic.

**Tech Stack:** NestJS, Prisma/PostgreSQL 16, class-validator, Next.js 15, React 19, Vitest, Supertest.

## Global Constraints

- Application scopes are `SOLO` and `TEAM`; a team application requires an active confirmed team containing the submitter.
- Application statuses are `DRAFT`, `SUBMITTED`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`, `CANCELLED`, and `COMPLETED`.
- A submitted stay must satisfy `listing.availableFrom <= moveIn` and `listing.availableTo >= moveOut`.
- Only approved canonical `Listing` records accept applications; users cannot apply to their own listing.
- Applicant/member display data is snapshotted and is never replaced by later profile edits.
- No identity document, bank statement, credit report, background-check file, or exact income is collected.
- Only the listing owner can list or decide incoming applications for that listing.
- Applicants may withdraw only `SUBMITTED` applications; applicant or owner may cancel `ACCEPTED` applications only before the agreed move-in date.
- Team dissolution leaves drafts un-submittable, automatically withdraws submitted team applications with reason `TEAM_DISSOLVED`, and does not bypass cancellation for accepted applications.
- Rejection, withdrawal, and cancellation clear `activeKey`; accepted applications remain active and released applications become `COMPLETED`.
- A listing permits one unfinished accepted application; while it exists, other submitted applications remain pending and new submissions are blocked. Cancellation reopens the listing, while `COMPLETED` closes it permanently.
- Every retryable mutation accepts and persists a bounded idempotency key.

---

### Task 1: Persist the application state machine and active-scope uniqueness

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260814160000_rental_applications/migration.sql`
- Create: `api/test/rental-applications-schema.spec.ts`

**Interfaces:**
- Produces: `RentalApplicationScope`, `RentalApplicationStatus`, `RentalIncomeBand`, and `GuarantorStatus` enums.
- Produces: `RentalApplication` with relations to listing, listing owner, submitter, optional team, and later demo payment.
- Produces: nullable unique `activeKey`, nullable unique `acceptedListingKey`, and unique nullable command-key columns.

- [ ] **Step 1: Write failing schema and migration tests**

Assert enum order, non-null snapshots/dates, optional `teamId`, owner/submitter foreign keys, the unique active key, and valid date/status check constraints:

```ts
expect(await scalar(db, `SELECT array_to_string(enum_range(NULL::"RentalApplicationStatus"), ',')`))
  .toBe("DRAFT,SUBMITTED,ACCEPTED,REJECTED,WITHDRAWN,CANCELLED,COMPLETED");
await expect(insertApplication({ scope: "TEAM", teamId: null }))
  .rejects.toThrow(/RentalApplication_team_scope_check/);
await expect(insertApplication({ moveIn: "2026-09-02", moveOut: "2026-09-01" }))
  .rejects.toThrow(/RentalApplication_date_order_check/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/rental-applications-schema.spec.ts`

Expected: FAIL because the application model does not exist.

- [ ] **Step 3: Add exact enums and model**

Use these application-owned fields:

```prisma
model RentalApplication {
  id                 String                  @id @default(cuid())
  listingId          String
  listingOwnerId     String
  submitterId        String
  teamId             String?
  scope              RentalApplicationScope
  status             RentalApplicationStatus @default(DRAFT)
  activeKey          String?                 @unique
  acceptedListingKey String?                 @unique
  memberSnapshots    Json
  moveIn             DateTime                @db.Date
  moveOut            DateTime                @db.Date
  schoolOrOccupation String
  incomeBand         RentalIncomeBand
  guarantorStatus    GuarantorStatus
  note               String
  createKey          String                  @unique
  submitKey          String?                 @unique
  withdrawKey        String?                 @unique
  decisionKey        String?                 @unique
  cancelKey          String?                 @unique
  submittedAt        DateTime?
  decidedAt          DateTime?
  decisionById       String?
  decisionReason     String?
  withdrawnAt        DateTime?
  cancelledAt        DateTime?
  cancelledById      String?
  cancellationReason String?
  createdAt          DateTime                @default(now())
  updatedAt          DateTime                @updatedAt
}
```

Add named relations on `User`, `Listing`, and `RoommateTeam`, useful status/viewer indexes, a date-order check, and a scope/team-nullability check. The future `DemoPayment` relation is added by the demo-payments migration.
Define income bands exactly as `BELOW_2X`, `TWO_TO_THREE_X`, `THREE_TO_FOUR_X`, `ABOVE_FOUR_X`, and `PREFER_NOT_TO_SAY`; define guarantor states exactly as `AVAILABLE`, `NOT_AVAILABLE`, and `NOT_NEEDED`.

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run: `cd api && pnpm prisma generate && pnpm vitest run test/rental-applications-schema.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814160000_rental_applications api/test/rental-applications-schema.spec.ts
git commit -m "feat: persist rental applications"
```

### Task 2: Create, read, submit, and withdraw applications

**Files:**
- Create: `api/src/applications/applications.dto.ts`
- Create: `api/src/applications/application-idempotency.ts`
- Create: `api/src/applications/applications.presenter.ts`
- Create: `api/src/applications/applications.service.ts`
- Create: `api/test/applications.service.spec.ts`

**Interfaces:**
- Produces: `CreateRentalApplicationDto` with `listingId`, `scope`, optional `teamId`, dates, `schoolOrOccupation`, `incomeBand`, `guarantorStatus`, and note.
- Produces: `ApplicationsService.create`, `mine`, `hostInbox`, `findOne`, `submit`, and `withdraw`.
- Produces: `requireIdempotencyKey(value): string`, accepting 8-120 visible ASCII characters.

- [ ] **Step 1: Write failing DTO/idempotency/service tests**

Test strict date and text bounds, no extra fields, 8-120 character keys, approved-listing requirement, own-listing rejection, exact boundary dates, out-of-range dates, solo/team active keys, active-team membership, immutable snapshots, viewer permissions, idempotent retries, submit transition, accepted/completed listing submission blocks, stale conflicts, and withdrawal clearing `activeKey`. `schoolOrOccupation` is trimmed, required, and at most 140 characters; `note` is trimmed and at most 1,000 characters; decision/cancellation reasons are trimmed, required, and at most 500 characters.

```ts
const draft = await service.create("renter-1", "create-key-0001", soloInput);
expect(draft).toMatchObject({ scope: "SOLO", status: "DRAFT" });
expect(draft.memberSnapshots).toEqual([{ userId: "renter-1", displayName: "Lin" }]);
await expect(service.submit("renter-1", draft.id, "submit-key-0001"))
  .resolves.toMatchObject({ status: "SUBMITTED" });
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/applications.service.spec.ts`

Expected: FAIL because the application module does not exist.

- [ ] **Step 3: Implement normalized creation and snapshots**

Resolve display data from the canonical user email plus `Profile` and `RoommateProfile` records. For team scope, snapshot both persisted team members in stable `userId` order. Build active keys exactly as `solo:<listingId>:<submitterId>` or `team:<listingId>:<teamId>`. A retry with the same `createKey` returns the original record; a different request for an occupied active key returns 409.

- [ ] **Step 4: Implement viewer reads and conditional submit/withdraw transitions**

`mine` includes applications submitted by the actor or by a team containing the actor. `hostInbox` filters by `listingOwnerId`. `findOne` uses the union of those rules. Submit rechecks current listing status/availability, team activity, and the absence of an `ACCEPTED` or `COMPLETED` application for the listing, then conditionally updates `DRAFT -> SUBMITTED`. Withdraw conditionally updates `SUBMITTED -> WITHDRAWN` and sets `activeKey = null`.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `cd api && pnpm vitest run test/applications.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/applications api/test/applications.service.spec.ts
git commit -m "feat: add renter application workflow"
```

### Task 3: Add owner decisions, atomic payment-order creation, and cancellation refund

**Files:**
- Modify: `api/src/applications/applications.dto.ts`
- Modify: `api/src/applications/applications.service.ts`
- Modify: `api/test/applications.service.spec.ts`

**Interfaces:**
- Consumes: `DemoPaymentsService.ensureOrderForAcceptedApplication(transaction, applicationId)`.
- Consumes: `DemoPaymentsService.refundForCancellation(transaction, applicationId, actorId, idempotencyKey)`.
- Produces: `ApplicationsService.accept`, `reject`, and `cancel`.

- [ ] **Step 1: Write failing owner-decision and cancellation tests**

Cover owner-only authorization, `SUBMITTED -> ACCEPTED|REJECTED`, one unfinished accepted application per listing, accepted payment-order creation in the same transaction, safe rejection reason bounds, applicant/owner cancellation before move-in, cancellation rejection on/after move-in, stranger rejection, no-fund cancellation, held-fund refund, released-fund conflict, idempotent retries, and terminal-state conflicts.

```ts
const accepted = await service.accept("owner-1", application.id, "accept-key-0001");
expect(accepted.status).toBe("ACCEPTED");
expect(payments.ensureOrderCalls).toEqual([{ applicationId: application.id }]);
await service.cancel("renter-1", application.id, "cancel-key-0001", { reason: "计划改变" });
expect(payments.refundCalls).toEqual([{ applicationId: application.id, actorId: "renter-1" }]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/applications.service.spec.ts`

Expected: FAIL on missing decision/cancellation methods.

- [ ] **Step 3: Implement conditional owner decisions**

Accept and reject load by `listingOwnerId`, use `updateMany({ id, status: "SUBMITTED" })`, persist the command key and decision metadata, and return the existing matching result on same-key retry. Acceptance first claims `acceptedListingKey = listingId`; a unique conflict returns `409 LISTING_APPLICATION_IN_PROGRESS`. It then calls the demo-payment order helper before the transaction commits. Rejection clears `activeKey`.

- [ ] **Step 4: Implement accepted cancellation**

Require actor to be `submitterId` or `listingOwnerId` and server time to be strictly before `moveIn`. Within one transaction call `refundForCancellation`; if it reports `RELEASED`, return 409 and leave the application unchanged. Otherwise conditionally update `ACCEPTED -> CANCELLED`, clear `activeKey` and `acceptedListingKey`, and record actor/reason/timestamp/key.

- [ ] **Step 5: Integrate team dissolution withdrawal**

Update `RoommateTeamsService.leave` in the same transaction to change that team's `SUBMITTED` applications to `WITHDRAWN`, clear `activeKey`, set `withdrawnAt`, and record `decisionReason = "TEAM_DISSOLVED"`. Leave `DRAFT` and `ACCEPTED` rows unchanged; draft submit validation and accepted cancellation rules handle them.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `cd api && pnpm vitest run test/applications.service.spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/applications api/test/applications.service.spec.ts
git commit -m "feat: add application decisions and cancellation"
```

### Task 4: Expose authenticated application APIs

**Files:**
- Create: `api/src/applications/applications.controller.ts`
- Create: `api/src/applications/applications.module.ts`
- Modify: `api/src/app.module.ts`
- Create: `api/test/applications.e2e.spec.ts`

**Interfaces:**
- Produces the approved `/applications` routes and strict body validation.

- [ ] **Step 1: Write failing HTTP tests**

Create renter, teammate, host, and stranger sessions. Exercise create/mine/detail/submit/withdraw, host inbox, accept/reject/cancel, missing/invalid idempotency keys, malformed fields, own-listing application, non-owner decisions, and refresh-visible state.

- [ ] **Step 2: Run the HTTP test and verify RED**

Run: `cd api && pnpm vitest run test/applications.e2e.spec.ts`

Expected: FAIL because the routes are absent.

- [ ] **Step 3: Implement controller and module**

Expose:

```text
POST   /applications
GET    /applications/mine
GET    /applications/host-inbox
GET    /applications/:id
POST   /applications/:id/submit
POST   /applications/:id/withdraw
POST   /applications/:id/accept
POST   /applications/:id/reject
POST   /applications/:id/cancel
```

Read `Idempotency-Key` for every POST and validate create/reason bodies using whitelist plus `forbidNonWhitelisted`.

- [ ] **Step 4: Run the HTTP test and verify GREEN**

Run: `cd api && pnpm vitest run test/applications.e2e.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/applications api/src/app.module.ts api/test/applications.e2e.spec.ts
git commit -m "feat: expose online application api"
```

### Task 5: Add renter wizard, Trips status, and host inbox UI

**Files:**
- Modify: `lib/api.ts`
- Create: `lib/rental-applications.ts`
- Create: `components/rental-application-panel.tsx`
- Create: `components/application-status-panel.tsx`
- Create: `components/host-application-inbox.tsx`
- Modify: `components/sublet-app.tsx`
- Create: `tests/rental-applications.test.ts`
- Create: `tests/rental-application-panel.test.tsx`
- Create: `tests/host-application-inbox.test.tsx`

**Interfaces:**
- Produces: `ApiRentalApplication`, `RentalApplicationDraft`, date/scope validation, and status copy.
- Produces: focused renter application and owner-decision components.

- [ ] **Step 1: Write failing pure and UI tests**

Cover solo/team scope availability, date coverage, trimmed bounded fields, review/submit, pending disablement, retry-safe command keys, refresh recovery, applicant status, owner-only inbox, decision confirmation, and safe errors.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/rental-applications.test.ts tests/rental-application-panel.test.tsx tests/host-application-inbox.test.tsx`

Expected: FAIL because the helpers/components are absent.

- [ ] **Step 3: Implement client types and short multi-step panel**

Use steps `申请方式 → 日期与资料 → 确认提交`. Prefill safe profile fields, offer `TEAM` only for the current active team, create then submit using stable keys retained for the pending command, and never collect sensitive documents or exact income.

- [ ] **Step 4: Replace placeholders and surface both viewer workspaces**

`在线申请` opens the panel. Trips loads `/applications/mine`; the landlord workspace loads `/applications/host-inbox`. Keep server responses authoritative, require confirmation before decisions, and refetch after successful commands.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `pnpm vitest run tests/rental-applications.test.ts tests/rental-application-panel.test.tsx tests/host-application-inbox.test.tsx tests/sublet-app-auth-state.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/rental-applications.ts components/rental-application-panel.tsx components/application-status-panel.tsx components/host-application-inbox.tsx components/sublet-app.tsx tests/rental-applications.test.ts tests/rental-application-panel.test.tsx tests/host-application-inbox.test.tsx
git commit -m "feat: add online rental application experience"
```
