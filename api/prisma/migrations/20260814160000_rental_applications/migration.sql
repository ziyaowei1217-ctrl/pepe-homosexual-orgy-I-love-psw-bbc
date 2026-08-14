CREATE TYPE "RentalApplicationScope" AS ENUM ('SOLO', 'TEAM');
CREATE TYPE "RentalApplicationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'CANCELLED', 'COMPLETED');
CREATE TYPE "RentalIncomeBand" AS ENUM ('BELOW_2X', 'TWO_TO_THREE_X', 'THREE_TO_FOUR_X', 'ABOVE_FOUR_X', 'PREFER_NOT_TO_SAY');
CREATE TYPE "GuarantorStatus" AS ENUM ('AVAILABLE', 'NOT_AVAILABLE', 'NOT_NEEDED');

CREATE TABLE "RentalApplication" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "listingOwnerId" TEXT NOT NULL,
  "submitterId" TEXT NOT NULL,
  "teamId" TEXT,
  "scope" "RentalApplicationScope" NOT NULL,
  "status" "RentalApplicationStatus" NOT NULL DEFAULT 'DRAFT',
  "activeKey" TEXT,
  "acceptedListingKey" TEXT,
  "memberSnapshots" JSONB NOT NULL,
  "moveIn" DATE NOT NULL,
  "moveOut" DATE NOT NULL,
  "schoolOrOccupation" TEXT NOT NULL,
  "incomeBand" "RentalIncomeBand" NOT NULL,
  "guarantorStatus" "GuarantorStatus" NOT NULL,
  "note" TEXT NOT NULL,
  "createKey" TEXT NOT NULL,
  "submitKey" TEXT,
  "withdrawKey" TEXT,
  "decisionKey" TEXT,
  "cancelKey" TEXT,
  "submittedAt" TIMESTAMP(3),
  "decidedAt" TIMESTAMP(3),
  "decisionById" TEXT,
  "decisionReason" TEXT,
  "withdrawnAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "cancellationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RentalApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RentalApplication_date_order_check" CHECK ("moveIn" < "moveOut"),
  CONSTRAINT "RentalApplication_team_scope_check" CHECK (
    ("scope" = 'SOLO' AND "teamId" IS NULL) OR
    ("scope" = 'TEAM' AND "teamId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "RentalApplication_activeKey_key" ON "RentalApplication"("activeKey");
CREATE UNIQUE INDEX "RentalApplication_acceptedListingKey_key" ON "RentalApplication"("acceptedListingKey");
CREATE UNIQUE INDEX "RentalApplication_createKey_key" ON "RentalApplication"("createKey");
CREATE UNIQUE INDEX "RentalApplication_submitKey_key" ON "RentalApplication"("submitKey");
CREATE UNIQUE INDEX "RentalApplication_withdrawKey_key" ON "RentalApplication"("withdrawKey");
CREATE UNIQUE INDEX "RentalApplication_decisionKey_key" ON "RentalApplication"("decisionKey");
CREATE UNIQUE INDEX "RentalApplication_cancelKey_key" ON "RentalApplication"("cancelKey");
CREATE INDEX "RentalApplication_submitterId_status_updatedAt_idx" ON "RentalApplication"("submitterId", "status", "updatedAt");
CREATE INDEX "RentalApplication_teamId_status_updatedAt_idx" ON "RentalApplication"("teamId", "status", "updatedAt");
CREATE INDEX "RentalApplication_listingOwnerId_status_updatedAt_idx" ON "RentalApplication"("listingOwnerId", "status", "updatedAt");
CREATE INDEX "RentalApplication_listingId_status_updatedAt_idx" ON "RentalApplication"("listingId", "status", "updatedAt");

ALTER TABLE "RentalApplication"
  ADD CONSTRAINT "RentalApplication_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RentalApplication_listingOwnerId_fkey" FOREIGN KEY ("listingOwnerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RentalApplication_submitterId_fkey" FOREIGN KEY ("submitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RentalApplication_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "RoommateTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "RentalApplication_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "RentalApplication_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
