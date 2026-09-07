-- Add lease application states without changing existing listing rows.
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'LEASED';
CREATE TYPE "LeaseApplicationStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

CREATE TABLE "LeaseApplication" (
  "id" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "applicantId" TEXT NOT NULL,
  "listingOwnerId" TEXT NOT NULL,
  "moveInDate" DATE NOT NULL,
  "moveOutDate" DATE NOT NULL,
  "occupantCount" INTEGER NOT NULL,
  "introduction" TEXT NOT NULL,
  "profileSnapshot" JSONB NOT NULL,
  "status" "LeaseApplicationStatus" NOT NULL DEFAULT 'SUBMITTED',
  "decisionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" TIMESTAMP(3),
  "withdrawnAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeaseApplication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LeaseApplication_occupantCount_check" CHECK ("occupantCount" BETWEEN 1 AND 8),
  CONSTRAINT "LeaseApplication_moveOutDate_check" CHECK ("moveOutDate" > "moveInDate")
);

CREATE UNIQUE INDEX "LeaseApplication_threadId_key" ON "LeaseApplication"("threadId");
CREATE UNIQUE INDEX "LeaseApplication_applicantId_listingId_key" ON "LeaseApplication"("applicantId", "listingId");
CREATE INDEX "LeaseApplication_applicantId_status_submittedAt_idx"
ON "LeaseApplication"("applicantId", "status", "submittedAt");
CREATE INDEX "LeaseApplication_listingOwnerId_status_submittedAt_idx"
ON "LeaseApplication"("listingOwnerId", "status", "submittedAt");
CREATE INDEX "LeaseApplication_listingId_status_submittedAt_idx"
ON "LeaseApplication"("listingId", "status", "submittedAt");

ALTER TABLE "LeaseApplication"
  ADD CONSTRAINT "LeaseApplication_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LeaseApplication_threadId_fkey"
  FOREIGN KEY ("threadId") REFERENCES "DealThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LeaseApplication_applicantId_fkey"
  FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LeaseApplication_listingOwnerId_fkey"
  FOREIGN KEY ("listingOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
