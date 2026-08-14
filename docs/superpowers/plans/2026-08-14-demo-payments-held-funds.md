# Simulated Payments And Held Funds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give accepted applications a clearly labelled, deterministic no-charge payment simulation with held, refunded, and released states backed by balanced immutable ledger entries.

**Architecture:** The demo-payments module owns payment orders, append-only attempts, one held-fund account per order, move-in confirmations, and double-entry ledger posting. Every balance transition runs in the same serializable PostgreSQL transaction as its state change. Database triggers prohibit ledger updates/deletes, while idempotency keys and unique constraints prevent duplicate attempts or postings.

**Tech Stack:** NestJS, Prisma/PostgreSQL 16, Next.js 15, React 19, Vitest, Supertest, Docker Compose.

## Global Constraints

- The feature never connects to Stripe or any processor, requests card/bank credentials, or moves real funds.
- Every surface displays the exact disclaimer `演示模式，不会真实扣款` and does not call the held balance regulated escrow.
- An accepted application has exactly one payment order for one month of listing rent, converted to integer cents.
- Simulation outcomes are deterministic explicit commands: `SUCCEEDED` or `FAILED`.
- The first successful attempt creates one held-fund account; later successful retries never create another account or another hold posting.
- Held funds refund on accepted-application cancellation strictly before the agreed move-in date and release only after renter and listing owner confirmations on or after that date.
- Cancelling an unpaid order closes it without creating a refund ledger event.
- Every hold, refund, and release posts one debit and one equal credit under one transaction ID.
- Ledger rows are immutable in PostgreSQL: update and delete operations fail.
- Idempotency keys protect attempts, confirmations, refunds, releases, and all associated postings.

---

### Task 1: Persist payment orders, attempts, held funds, and double-entry ledger rows

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260814170000_demo_payments/migration.sql`
- Create: `api/test/demo-payments-schema.spec.ts`

**Interfaces:**
- Produces: `DemoPaymentStatus`, `DemoPaymentAttemptOutcome`, `DemoHeldFundStatus`, `DemoLedgerEvent`, `DemoLedgerAccount`, and `DemoLedgerDirection` enums.
- Produces: `DemoPayment`, `DemoPaymentAttempt`, `DemoHeldFund`, and `DemoLedgerEntry`.
- Produces: database trigger `DemoLedgerEntry_immutable`.

- [ ] **Step 1: Write failing source/disposable-PostgreSQL tests**

Assert enums, one payment per application, one held fund per payment, positive amounts, unique attempt/confirmation keys, balanced-entry uniqueness, and immutable ledger behavior:

```ts
await db.query(`
  INSERT INTO "DemoLedgerEntry"
    ("id", "transactionId", "paymentId", "heldFundId", "event", "account",
     "direction", "amountCents", "idempotencyKey", "createdAt")
  VALUES
    ('entry-1', 'transaction-1', 'payment-1', 'fund-1', 'HOLD', 'RENTER_CLEARING',
     'DEBIT', 185000, 'hold-key-0001', NOW())
`);
await expect(db.query(`UPDATE "DemoLedgerEntry" SET "amountCents" = 1 WHERE "id" = 'entry-1'`))
  .rejects.toThrow(/DemoLedgerEntry is immutable/);
await expect(db.query(`DELETE FROM "DemoLedgerEntry" WHERE "id" = 'entry-1'`))
  .rejects.toThrow(/DemoLedgerEntry is immutable/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/demo-payments-schema.spec.ts`

Expected: FAIL because the payment tables do not exist.

- [ ] **Step 3: Add exact models and constraints**

Use these principal fields:

```prisma
model DemoPayment {
  id            String            @id @default(cuid())
  applicationId String            @unique
  payerId       String
  payeeId       String
  amountCents   Int
  currency      String            @default("USD")
  status        DemoPaymentStatus @default(AWAITING_ATTEMPT)
  attempts      DemoPaymentAttempt[]
  heldFund      DemoHeldFund?
  ledgerEntries DemoLedgerEntry[]
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt
}

model DemoHeldFund {
  id                    String             @id @default(cuid())
  paymentId             String             @unique
  amountCents           Int
  status                DemoHeldFundStatus @default(HELD)
  renterConfirmedAt     DateTime?
  ownerConfirmedAt      DateTime?
  renterConfirmationKey String?            @unique
  ownerConfirmationKey  String?            @unique
  refundKey             String?            @unique
  releaseKey            String?            @unique
  refundedAt            DateTime?
  releasedAt            DateTime?
  createdAt             DateTime           @default(now())
  updatedAt             DateTime           @updatedAt
}
```

`DemoPaymentAttempt` stores `paymentId`, `actorId`, globally unique `idempotencyKey`, outcome, `applied`, and timestamp. `DemoLedgerEntry` stores `transactionId`, payment/fund IDs, event, account, direction, positive `amountCents`, idempotency key, and timestamp; unique `(transactionId, account, direction)` prevents duplicate lines. Add amount/currency and ledger checks plus the update/delete trigger.

- [ ] **Step 4: Generate Prisma and verify GREEN**

Run: `cd api && pnpm prisma generate && pnpm vitest run test/demo-payments-schema.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260814170000_demo_payments api/test/demo-payments-schema.spec.ts
git commit -m "feat: persist simulated held funds ledger"
```

### Task 2: Implement balanced immutable ledger posting

**Files:**
- Create: `api/src/demo-payments/demo-ledger.ts`
- Create: `api/test/demo-ledger.spec.ts`

**Interfaces:**
- Produces: `postDemoLedgerPair(transaction, input): Promise<DemoLedgerEntry[]>`.
- Produces exact account mappings for `HOLD`, `REFUND`, and `RELEASE`.

- [ ] **Step 1: Write failing pure/service tests**

Assert mappings and equal positive amounts:

```ts
expect(accountsFor("HOLD")).toEqual([
  { account: "RENTER_CLEARING", direction: "DEBIT" },
  { account: "HELD_FUNDS", direction: "CREDIT" }
]);
expect(accountsFor("REFUND")).toEqual([
  { account: "HELD_FUNDS", direction: "DEBIT" },
  { account: "RENTER_CLEARING", direction: "CREDIT" }
]);
expect(accountsFor("RELEASE")).toEqual([
  { account: "HELD_FUNDS", direction: "DEBIT" },
  { account: "HOST_CLEARING", direction: "CREDIT" }
]);
```

Test retry of the same transaction/idempotency key returns the existing pair and does not create rows 3-4.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/demo-ledger.spec.ts`

Expected: FAIL because the ledger helper does not exist.

- [ ] **Step 3: Implement minimal balanced posting**

Reject non-positive/non-integer amounts. Generate one transaction ID per new event and insert both entries with `createMany`; on same-key retry read and validate exactly two opposite-direction equal lines. Never update or delete ledger rows.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `cd api && pnpm vitest run test/demo-ledger.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/demo-payments/demo-ledger.ts api/test/demo-ledger.spec.ts
git commit -m "feat: post balanced demo ledger entries"
```

### Task 3: Implement payment simulation, refund, confirmation, and release transitions

**Files:**
- Create: `api/src/demo-payments/demo-payments.presenter.ts`
- Create: `api/src/demo-payments/demo-payments.service.ts`
- Create: `api/test/demo-payments.service.spec.ts`

**Interfaces:**
- Produces: `ensureOrderForAcceptedApplication(transaction, applicationId)`.
- Produces: `findByApplication`, `simulateSuccess`, `simulateFailure`, `confirmMoveIn`.
- Produces: `refundForCancellation(transaction, applicationId, actorId, idempotencyKey): Promise<"NO_FUNDS" | "REFUNDED" | "RELEASED">`.

- [ ] **Step 1: Write failing service tests**

Cover accepted-only order creation, amount `listing.price * 100`, one order, applicant/owner read authorization, applicant-only simulations, failed attempts, first success hold, repeated success, same-key retries, terminal-state behavior, confirmation rejection before `application.moveIn`, one timestamp per party, dual-confirm release, application completion, cancellation refund, unpaid cancellation without a refund posting, release conflict, and exact balanced ledger pairs.

```ts
const payment = await service.ensureOrderForAcceptedApplication(tx, "application-1");
expect(payment).toMatchObject({ amountCents: 185000, status: "AWAITING_ATTEMPT" });
const held = await service.simulateSuccess("renter-1", "application-1", "success-key-0001");
expect(held).toMatchObject({ payment: { status: "HELD" }, heldFund: { status: "HELD" } });
expect(balance(held.ledgerEntries)).toBe(0);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd api && pnpm vitest run test/demo-payments.service.spec.ts`

Expected: FAIL because `DemoPaymentsService` does not exist.

- [ ] **Step 3: Implement order/read and deterministic attempts**

Order creation loads an `ACCEPTED` application and listing inside the caller transaction, uses submitter/owner IDs, and upserts by application. A new failed simulation is allowed only in `AWAITING_ATTEMPT`, appends one unapplied failed attempt, and leaves the order awaiting. First success appends an applied success attempt, creates `HELD`, changes payment to `HELD`, and posts `HOLD`; a new success while already `HELD` appends one unapplied success attempt and returns the same fund. Any same-key retry returns the original attempt/result. New simulations after `REFUNDED` or `RELEASED` return 409.

- [ ] **Step 4: Implement refund and dual confirmation**

Refund returns `NO_FUNDS` when no account exists, closes an unpaid payment without a ledger posting, or conditionally updates `HELD -> REFUNDED`, updates payment, and posts `REFUND`. Confirmation loads `application.moveIn`, rejects server time before that date, identifies the actor as submitter or listing owner, and only sets that actor's timestamp/key. A second confirmation by the same actor returns the original timestamp without changing its key. If the other party's timestamp is now present, conditionally update `HELD -> RELEASED`, update payment, post `RELEASE`, and transition the application `ACCEPTED -> COMPLETED` in the same transaction while retaining `acceptedListingKey` to keep the listing closed.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `cd api && pnpm vitest run test/demo-payments.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/demo-payments api/test/demo-payments.service.spec.ts
git commit -m "feat: add simulated payment state machine"
```

### Task 4: Expose explicitly named demo-money APIs

**Files:**
- Create: `api/src/demo-payments/demo-payments.controller.ts`
- Create: `api/src/demo-payments/demo-payments.module.ts`
- Modify: `api/src/app.module.ts`
- Modify: `api/src/applications/applications.module.ts`
- Create: `api/test/demo-payments.e2e.spec.ts`

**Interfaces:**
- Exports: `DemoPaymentsService` for atomic application accept/cancel orchestration.
- Produces the approved demo-payment and held-fund routes.

- [ ] **Step 1: Write failing HTTP tests**

Exercise authorized GET, deterministic failure/success, retry with same key, held state, renter confirmation, owner confirmation/release, cancellation/refund, stranger denial, malformed/missing keys, and the absence of any card/payment-credential input.

- [ ] **Step 2: Run the HTTP test and verify RED**

Run: `cd api && pnpm vitest run test/demo-payments.e2e.spec.ts`

Expected: FAIL because the routes are absent.

- [ ] **Step 3: Implement controller/module wiring**

Expose:

```text
GET    /demo-payments/by-application/:applicationId
POST   /demo-payments/by-application/:applicationId/simulate-success
POST   /demo-payments/by-application/:applicationId/simulate-failure
POST   /demo-held-funds/:id/confirm-move-in
```

Require `AuthGuard` and `Idempotency-Key` for POSTs. Do not accept a request body for payment simulation or any payment instrument field. Export the service and import its module from applications.

- [ ] **Step 4: Run the HTTP test and verify GREEN**

Run: `cd api && pnpm vitest run test/demo-payments.e2e.spec.ts test/applications.e2e.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/demo-payments api/src/applications/applications.module.ts api/src/app.module.ts api/test/demo-payments.e2e.spec.ts
git commit -m "feat: expose simulated payment api"
```

### Task 5: Add the demo-payment panel and held-fund timeline

**Files:**
- Modify: `lib/api.ts`
- Create: `lib/demo-payments.ts`
- Create: `components/demo-payment-panel.tsx`
- Modify: `components/application-status-panel.tsx`
- Modify: `components/host-application-inbox.tsx`
- Modify: `components/sublet-app.tsx`
- Create: `tests/demo-payments.test.ts`
- Create: `tests/demo-payment-panel.test.tsx`

**Interfaces:**
- Produces: `ApiDemoPaymentState`, status/timeline derivation, and a focused `DemoPaymentPanel`.

- [ ] **Step 1: Write failing pure and UI tests**

Assert the exact disclaimer is always visible, the amount/application scope are repeated, only accepted applications load the panel, success/failure are explicit, failure remains retryable, refresh restores held state, each party sees its confirmation, terminal refund/release disables commands, and no input has card/account/credential semantics.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm vitest run tests/demo-payments.test.ts tests/demo-payment-panel.test.tsx`

Expected: FAIL because the client helpers and panel are absent.

- [ ] **Step 3: Implement server-backed panel and disclaimer**

Render `演示模式，不会真实扣款` in the panel header and confirmation area. Retain one generated idempotency key for each in-flight command and regenerate only after a completed command. After mutation, replace local display from the returned server state and refetch on remount.

- [ ] **Step 4: Integrate applicant and owner confirmation surfaces**

Applicants reach payment from their accepted application status. Both applicant and host see the same held-fund timeline and their own `确认已入住` command. Application cancellation remains the only refund command; do not add a client-side force-refund button.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run: `pnpm vitest run tests/demo-payments.test.ts tests/demo-payment-panel.test.tsx tests/rental-application-panel.test.tsx tests/host-application-inbox.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/demo-payments.ts components/demo-payment-panel.tsx components/application-status-panel.tsx components/host-application-inbox.tsx components/sublet-app.tsx tests/demo-payments.test.ts tests/demo-payment-panel.test.tsx
git commit -m "feat: add no-charge payment simulation ui"
```

### Task 6: Prove the complete PostgreSQL and MinIO journey

**Files:**
- Create: `api/test/marketplace-demo-journey.smoke.spec.ts`
- Modify: `api/package.json`
- Modify: `README.md`

**Interfaces:**
- Produces: `pnpm --dir api launch:smoke:marketplace`.

- [ ] **Step 1: Write the opt-in smoke test**

With `RUN_DB_SMOKE=1` and configured MinIO, execute: host listing/photo submission and approval; date-covered renter search; reciprocal match and confirmed team; team application submission and owner acceptance; failed then successful payment; held-fund state; renter and owner move-in confirmations; released state; balanced immutable ledger query.

- [ ] **Step 2: Run without services and verify a deliberate skip**

Run: `cd api && pnpm vitest run test/marketplace-demo-journey.smoke.spec.ts`

Expected: one skipped test because `RUN_DB_SMOKE` is unset.

- [ ] **Step 3: Add the script and accurate scope documentation**

Document MinIO environment values, 10 MB/12-image limits, team/application/payment state machines, the exact no-charge disclaimer, and the smoke command. State explicitly that this is simulated held funds rather than real payment or regulated escrow.

- [ ] **Step 4: Run with local services and verify GREEN**

Run: `docker compose up -d postgres minio minio-init && cd api && RUN_DB_SMOKE=1 pnpm vitest run test/marketplace-demo-journey.smoke.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/test/marketplace-demo-journey.smoke.spec.ts api/package.json README.md
git commit -m "test: prove marketplace demo journey"
```
