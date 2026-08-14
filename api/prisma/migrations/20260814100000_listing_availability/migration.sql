ALTER TABLE "Listing"
  ADD COLUMN "availableFrom" DATE,
  ADD COLUMN "availableTo" DATE;

UPDATE "Listing"
SET "availableFrom" = DATE '2026-08-01',
    "availableTo" = DATE '2027-08-01'
WHERE "availableFrom" IS NULL OR "availableTo" IS NULL;

ALTER TABLE "Listing"
  ALTER COLUMN "availableFrom" SET NOT NULL,
  ALTER COLUMN "availableTo" SET NOT NULL,
  ADD CONSTRAINT "Listing_availability_order_check"
    CHECK ("availableFrom" < "availableTo");

CREATE INDEX "Listing_status_availableFrom_availableTo_idx"
ON "Listing"("status", "availableFrom", "availableTo");
