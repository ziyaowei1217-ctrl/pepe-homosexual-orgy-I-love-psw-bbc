-- Add production-only enum states without rewriting existing rows.
ALTER TYPE "ListingStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';

CREATE TYPE "VerificationPurpose" AS ENUM ('LOGIN', 'ADMIN_STEP_UP');
CREATE TYPE "VerificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
CREATE TYPE "MediaStorageStatus" AS ENUM ('PENDING', 'READY', 'PUBLISHED', 'FAILED');
CREATE TYPE "MediaReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Old SHA-256 codes cannot be verified by the versioned HMAC implementation.
-- Marking them consumed preserves the records and leaves user accounts untouched.
UPDATE "VerificationCode"
SET "consumedAt" = CURRENT_TIMESTAMP
WHERE "consumedAt" IS NULL;

ALTER TABLE "VerificationCode"
  ADD COLUMN "purpose" "VerificationPurpose" NOT NULL DEFAULT 'LOGIN',
  ADD COLUMN "codeSalt" TEXT,
  ADD COLUMN "hashVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "deliveryStatus" "VerificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "sentAt" TIMESTAMP(3),
  ADD COLUMN "failedAt" TIMESTAMP(3),
  ADD COLUMN "providerMessageId" TEXT;

CREATE INDEX "VerificationCode_email_purpose_deliveryStatus_createdAt_idx"
ON "VerificationCode"("email", "purpose", "deliveryStatus", "createdAt");

CREATE INDEX "VerificationCode_deliveryStatus_createdAt_idx"
ON "VerificationCode"("deliveryStatus", "createdAt");

CREATE TABLE "BetaInvite" (
  "id" TEXT NOT NULL,
  "normalizedEmail" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "reason" TEXT,
  "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "revocationReason" TEXT,

  CONSTRAINT "BetaInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BetaInvite_normalizedEmail_key" ON "BetaInvite"("normalizedEmail");
CREATE INDEX "BetaInvite_normalizedEmail_revokedAt_idx" ON "BetaInvite"("normalizedEmail", "revokedAt");
CREATE INDEX "BetaInvite_invitedAt_idx" ON "BetaInvite"("invitedAt");

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorUserId" TEXT,
  "actorEmail" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "outcome" TEXT NOT NULL,
  "requestId" TEXT,
  "ipHash" TEXT,
  "deviceHash" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}'::JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");
CREATE INDEX "AuditEvent_targetType_targetId_createdAt_idx" ON "AuditEvent"("targetType", "targetId", "createdAt");
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");

CREATE FUNCTION "reject_audit_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AuditEvent records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditEvent_immutable"
BEFORE UPDATE OR DELETE ON "AuditEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_audit_event_mutation"();

ALTER TABLE "Listing"
  ALTER COLUMN "image" DROP NOT NULL,
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedBy" TEXT,
  ADD COLUMN "suspensionReason" TEXT;

ALTER TABLE "ListingMedia"
  ALTER COLUMN "url" DROP NOT NULL,
  ADD COLUMN "originalKey" TEXT,
  ADD COLUMN "processedKey" TEXT,
  ADD COLUMN "publicMainKey" TEXT,
  ADD COLUMN "publicThumbnailKey" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "width" INTEGER,
  ADD COLUMN "height" INTEGER,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "uploadExpiresAt" TIMESTAMP(3),
  ADD COLUMN "storageStatus" "MediaStorageStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewStatus" "MediaReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "finalizedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "ListingMedia_listingId_storageStatus_sortOrder_idx"
ON "ListingMedia"("listingId", "storageStatus", "sortOrder");

CREATE INDEX "ListingMedia_listingId_reviewStatus_sortOrder_idx"
ON "ListingMedia"("listingId", "reviewStatus", "sortOrder");

CREATE INDEX "ListingMedia_uploadExpiresAt_idx" ON "ListingMedia"("uploadExpiresAt");

-- The lower-case legacy housing table remains readable through Prisma, but all
-- mutations are rejected at the database boundary while its compatibility data is retained.
CREATE FUNCTION "reject_legacy_listings_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'legacy listings table is read-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "listings_read_only"
BEFORE INSERT OR UPDATE OR DELETE ON "listings"
FOR EACH ROW EXECUTE FUNCTION "reject_legacy_listings_mutation"();
