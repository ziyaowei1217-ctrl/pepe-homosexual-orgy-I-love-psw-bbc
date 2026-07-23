ALTER TABLE "RoommateProfile" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "RoommateProfile" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "RoommateProfile_status_match_idx" ON "RoommateProfile"("status", "match");
