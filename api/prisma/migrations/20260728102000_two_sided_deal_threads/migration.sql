ALTER TABLE "DealThread" ADD COLUMN "listingOwnerId" TEXT;

UPDATE "DealThread" AS thread
SET "listingOwnerId" = listing."ownerId"
FROM "Listing" AS listing
WHERE listing.id = thread."listingId";

ALTER TABLE "DealThread" ALTER COLUMN "listingOwnerId" SET NOT NULL;

ALTER TABLE "DealThread"
ADD CONSTRAINT "DealThread_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DealThread"
ADD CONSTRAINT "DealThread_listingOwnerId_fkey"
FOREIGN KEY ("listingOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DealThread_listingOwnerId_updatedAt_idx"
ON "DealThread"("listingOwnerId", "updatedAt");
