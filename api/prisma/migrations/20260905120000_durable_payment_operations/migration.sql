ALTER TYPE "RentalApplicationStatus" ADD VALUE IF NOT EXISTS 'CANCELLATION_PENDING';
CREATE TYPE "PaymentOperationKind" AS ENUM ('ACCEPT', 'CANCEL');
CREATE TYPE "PaymentOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'BLOCKED');

CREATE TABLE "PaymentOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "applicationId" TEXT NOT NULL,
  "kind" "PaymentOperationKind" NOT NULL,
  "status" "PaymentOperationStatus" NOT NULL DEFAULT 'PENDING',
  "actorId" TEXT,
  "providerKey" TEXT NOT NULL,
  "result" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "lockToken" TEXT,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentOperation_result_check" CHECK ("result" IS NULL OR "result" IN ('NO_FUNDS', 'REFUNDED', 'RELEASED')),
  CONSTRAINT "PaymentOperation_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "RentalApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PaymentOperation_providerKey_key" ON "PaymentOperation"("providerKey");
CREATE UNIQUE INDEX "PaymentOperation_applicationId_kind_key" ON "PaymentOperation"("applicationId", "kind");
CREATE INDEX "PaymentOperation_status_nextAttemptAt_idx" ON "PaymentOperation"("status", "nextAttemptAt");
