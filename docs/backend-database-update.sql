-- psw: database tables for phone sign-up and saving favorites/preferences to accounts.
-- Covers migrations 20261024060000_phone_identities and 20261117000000_user_documents.
-- Paste all of this into the Neon console SQL Editor (psw project, main branch, database neondb) and press Run.
-- It only adds tables. Every step is skipped when it is already in place, so running it twice is harmless.
BEGIN;

-- 1. Phone numbers used to sign in (already there if the 2026-10-24 phone SQL was run).
CREATE TABLE IF NOT EXISTS "PhoneIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhoneIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PhoneIdentity_phoneNumber_e164" CHECK ("phoneNumber" ~ '^\+[1-9][0-9]{7,14}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneIdentity_userId_key" ON "PhoneIdentity"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "PhoneIdentity_phoneNumber_key" ON "PhoneIdentity"("phoneNumber");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PhoneIdentity_userId_fkey') THEN
    ALTER TABLE "PhoneIdentity" ADD CONSTRAINT "PhoneIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 2. Saved lists, match preferences and feed signals, one JSON document per account and kind.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserDocumentKind') THEN
    CREATE TYPE "UserDocumentKind" AS ENUM ('SAVED_COLLECTIONS', 'RENTER_PREFERENCES', 'FEED_SIGNALS');
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "UserDocument" (
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
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserDocument_userId_fkey') THEN
    ALTER TABLE "UserDocument" ADD CONSTRAINT "UserDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- 3. The API's restricted database login may read and write both tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'psw_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PhoneIdentity", "UserDocument" TO psw_runtime;
  END IF;
END $$;

-- 4. Record both migrations so `prisma migrate deploy` does not try to apply them again.
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, '04c7904c8b5e084e974900af68bf9a6806ad4218b8bb7ce6a2cc0b72408b500f', now(), '20261024060000_phone_identities', NULL, NULL, now(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261024060000_phone_identities');
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, '2161da5d9aa83d54533e233b6a10ac28c2c86e02b60dd7b3f4fe629513e58568', now(), '20261117000000_user_documents', NULL, NULL, now(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '20261117000000_user_documents');

COMMIT;

-- Check: two rows marked true, then true for the API login (or no row if there is no psw_runtime login).
SELECT migration_name, finished_at IS NOT NULL AS applied FROM "_prisma_migrations"
WHERE migration_name IN ('20261024060000_phone_identities', '20261117000000_user_documents') ORDER BY migration_name;
SELECT has_table_privilege('psw_runtime', '"UserDocument"', 'INSERT') AND has_table_privilege('psw_runtime', '"PhoneIdentity"', 'INSERT') AS runtime_can_write
WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'psw_runtime');
