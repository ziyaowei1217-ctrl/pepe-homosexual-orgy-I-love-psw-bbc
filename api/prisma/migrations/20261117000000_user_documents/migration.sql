-- Per-account app data that the website used to keep only in one browser.
CREATE TYPE "UserDocumentKind" AS ENUM ('SAVED_COLLECTIONS', 'RENTER_PREFERENCES', 'FEED_SIGNALS');

CREATE TABLE "UserDocument" (
    "userId" TEXT NOT NULL,
    "kind" "UserDocumentKind" NOT NULL,
    "revision" INTEGER NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserDocument_pkey" PRIMARY KEY ("userId","kind"),
    CONSTRAINT "UserDocument_revision_positive" CHECK ("revision" > 0),
    CONSTRAINT "UserDocument_value_object" CHECK (jsonb_typeof("value") = 'object')
);

ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
