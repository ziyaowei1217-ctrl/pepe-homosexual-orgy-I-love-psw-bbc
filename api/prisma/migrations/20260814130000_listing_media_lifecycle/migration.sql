BEGIN;

ALTER TYPE "MediaStorageStatus" RENAME TO "MediaStorageStatus_old";

CREATE TYPE "MediaStorageStatus" AS ENUM (
  'PENDING_UPLOAD',
  'UPLOADED_PENDING_VALIDATION',
  'READY',
  'PUBLISHED',
  'FAILED'
);

ALTER TABLE "ListingMedia"
  ALTER COLUMN "storageStatus" DROP DEFAULT;

ALTER TABLE "ListingMedia"
  ALTER COLUMN "storageStatus" TYPE "MediaStorageStatus"
  USING (
    CASE
      WHEN "storageStatus"::text = 'PENDING' THEN 'PENDING_UPLOAD'
      ELSE "storageStatus"::text
    END
  )::"MediaStorageStatus";

ALTER TABLE "ListingMedia"
  ALTER COLUMN "storageStatus" SET DEFAULT 'PENDING_UPLOAD';

ALTER TABLE "ListingMedia"
  ADD COLUMN "securityErrorCode" TEXT;

DROP TYPE "MediaStorageStatus_old";

COMMIT;
