CREATE TABLE "ListingMediaInitialization" (
  "ownerId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "listingId" TEXT NOT NULL,
  "mediaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ListingMediaInitialization_pkey" PRIMARY KEY ("ownerId", "commandId")
);
CREATE UNIQUE INDEX "ListingMediaInitialization_mediaId_key" ON "ListingMediaInitialization"("mediaId");
CREATE INDEX "ListingMediaInitialization_listingId_idx" ON "ListingMediaInitialization"("listingId");
ALTER TABLE "ListingMediaInitialization" ADD CONSTRAINT "ListingMediaInitialization_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingMediaInitialization" ADD CONSTRAINT "ListingMediaInitialization_mediaId_fkey"
  FOREIGN KEY ("mediaId") REFERENCES "ListingMedia"("id") ON DELETE SET NULL ON UPDATE CASCADE;
