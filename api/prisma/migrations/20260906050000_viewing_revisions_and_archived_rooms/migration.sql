ALTER TABLE "ViewingRequest" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
DROP INDEX "DealRoom_ownerId_roommateProfileId_key";
CREATE UNIQUE INDEX "DealRoom_active_owner_roommate_key"
ON "DealRoom" ("ownerId", "roommateProfileId") WHERE "status" = 'ACTIVE';
