CREATE TYPE "DemoPaymentStatus" AS ENUM ('AWAITING_ATTEMPT', 'HELD', 'REFUNDED', 'RELEASED', 'CLOSED');
CREATE TYPE "DemoPaymentAttemptOutcome" AS ENUM ('SUCCEEDED', 'FAILED');
CREATE TYPE "DemoHeldFundStatus" AS ENUM ('HELD', 'REFUNDED', 'RELEASED');
CREATE TYPE "DemoLedgerEvent" AS ENUM ('HOLD', 'REFUND', 'RELEASE');
CREATE TYPE "DemoLedgerAccount" AS ENUM ('RENTER_CLEARING', 'HELD_FUNDS', 'HOST_CLEARING');
CREATE TYPE "DemoLedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "DemoPayment" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "payerId" TEXT NOT NULL,
  "payeeId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "status" "DemoPaymentStatus" NOT NULL DEFAULT 'AWAITING_ATTEMPT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemoPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemoPayment_positive_amount" CHECK ("amountCents" > 0),
  CONSTRAINT "DemoPayment_usd_only" CHECK ("currency" = 'USD')
);

CREATE TABLE "DemoPaymentAttempt" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "outcome" "DemoPaymentAttemptOutcome" NOT NULL,
  "applied" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoPaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemoPaymentAttempt_failed_not_applied" CHECK ("outcome" <> 'FAILED' OR "applied" = FALSE)
);

CREATE TABLE "DemoHeldFund" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "status" "DemoHeldFundStatus" NOT NULL DEFAULT 'HELD',
  "renterConfirmedAt" TIMESTAMP(3),
  "ownerConfirmedAt" TIMESTAMP(3),
  "renterConfirmationKey" TEXT,
  "ownerConfirmationKey" TEXT,
  "refundKey" TEXT,
  "releaseKey" TEXT,
  "refundedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemoHeldFund_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemoHeldFund_positive_amount" CHECK ("amountCents" > 0)
);

CREATE TABLE "DemoLedgerEntry" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "heldFundId" TEXT NOT NULL,
  "event" "DemoLedgerEvent" NOT NULL,
  "account" "DemoLedgerAccount" NOT NULL,
  "direction" "DemoLedgerDirection" NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoLedgerEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DemoLedgerEntry_positive_amount" CHECK ("amountCents" > 0)
);

CREATE UNIQUE INDEX "DemoPayment_applicationId_key" ON "DemoPayment"("applicationId");
CREATE INDEX "DemoPayment_payerId_status_updatedAt_idx" ON "DemoPayment"("payerId", "status", "updatedAt");
CREATE INDEX "DemoPayment_payeeId_status_updatedAt_idx" ON "DemoPayment"("payeeId", "status", "updatedAt");
CREATE UNIQUE INDEX "DemoPaymentAttempt_idempotencyKey_key" ON "DemoPaymentAttempt"("idempotencyKey");
CREATE INDEX "DemoPaymentAttempt_paymentId_createdAt_idx" ON "DemoPaymentAttempt"("paymentId", "createdAt");
CREATE INDEX "DemoPaymentAttempt_actorId_createdAt_idx" ON "DemoPaymentAttempt"("actorId", "createdAt");
CREATE UNIQUE INDEX "DemoHeldFund_paymentId_key" ON "DemoHeldFund"("paymentId");
CREATE UNIQUE INDEX "DemoHeldFund_renterConfirmationKey_key" ON "DemoHeldFund"("renterConfirmationKey");
CREATE UNIQUE INDEX "DemoHeldFund_ownerConfirmationKey_key" ON "DemoHeldFund"("ownerConfirmationKey");
CREATE UNIQUE INDEX "DemoHeldFund_refundKey_key" ON "DemoHeldFund"("refundKey");
CREATE UNIQUE INDEX "DemoHeldFund_releaseKey_key" ON "DemoHeldFund"("releaseKey");
CREATE INDEX "DemoHeldFund_status_updatedAt_idx" ON "DemoHeldFund"("status", "updatedAt");
CREATE UNIQUE INDEX "DemoLedgerEntry_transactionId_account_direction_key" ON "DemoLedgerEntry"("transactionId", "account", "direction");
CREATE UNIQUE INDEX "DemoLedgerEntry_idempotencyKey_account_direction_key" ON "DemoLedgerEntry"("idempotencyKey", "account", "direction");
CREATE INDEX "DemoLedgerEntry_paymentId_createdAt_idx" ON "DemoLedgerEntry"("paymentId", "createdAt");
CREATE INDEX "DemoLedgerEntry_heldFundId_createdAt_idx" ON "DemoLedgerEntry"("heldFundId", "createdAt");
CREATE INDEX "DemoLedgerEntry_idempotencyKey_idx" ON "DemoLedgerEntry"("idempotencyKey");

ALTER TABLE "DemoPayment"
  ADD CONSTRAINT "DemoPayment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DemoPayment_payerId_fkey" FOREIGN KEY ("payerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DemoPayment_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DemoPaymentAttempt"
  ADD CONSTRAINT "DemoPaymentAttempt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DemoPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DemoPaymentAttempt_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DemoHeldFund"
  ADD CONSTRAINT "DemoHeldFund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DemoPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DemoLedgerEntry"
  ADD CONSTRAINT "DemoLedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "DemoPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "DemoLedgerEntry_heldFundId_fkey" FOREIGN KEY ("heldFundId") REFERENCES "DemoHeldFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "prevent_demo_ledger_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'DemoLedgerEntry is immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DemoLedgerEntry_immutable"
BEFORE UPDATE OR DELETE ON "DemoLedgerEntry"
FOR EACH ROW EXECUTE FUNCTION "prevent_demo_ledger_mutation"();

CREATE TRIGGER "DemoLedgerEntry_truncate_immutable"
BEFORE TRUNCATE ON "DemoLedgerEntry"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_demo_ledger_mutation"();
