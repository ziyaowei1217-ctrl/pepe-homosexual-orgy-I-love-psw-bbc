import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const runDatabaseMigrationTests = process.env.RUN_DB_SMOKE === "1";
const describeMigration = runDatabaseMigrationTests ? describe : describe.skip;
const migrationsDir = join(__dirname, "../prisma/migrations");
const databaseName = `production_foundations_${randomUUID().replaceAll("-", "")}`;

function dockerPsql(args: string[], input?: string) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8", input }
  );

  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout.trim();
}

function executeSql(sql: string) {
  dockerPsql(["-d", databaseName], sql);
}

function query(sql: string) {
  return dockerPsql(["-d", databaseName, "-tAc", sql]);
}

describeMigration("production database foundations migration", () => {
  beforeAll(() => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE \"${databaseName}\"`]);

    const migrations = readdirSync(migrationsDir).sort();
    for (const [index, migration] of migrations.entries()) {
      executeSql(readFileSync(join(migrationsDir, migration, "migration.sql"), "utf8"));

      // These rows emulate data present before the additive production migration.
      if (index === 5) {
        executeSql(`
          INSERT INTO "User" ("id", "email", "updatedAt")
          VALUES ('existing-user', 'existing@example.com', CURRENT_TIMESTAMP);

          INSERT INTO "Listing" (
            "id", "ownerId", "title", "area", "image", "price", "originalPrice",
            "beds", "baths", "commute", "transit", "trust", "tags", "updatedAt"
          ) VALUES (
            'existing-listing', 'existing-user', 'Existing listing', 'Downtown', 'https://legacy.example/image.jpg',
            2200, 2400, 1, 1, '20 min', 'Metro', 'verified', ARRAY['legacy'], CURRENT_TIMESTAMP
          );

          INSERT INTO "VerificationCode" ("id", "email", "codeHash", "expiresAt")
          VALUES ('existing-code', 'existing@example.com', 'legacy-hash', CURRENT_TIMESTAMP + INTERVAL '10 minutes');

          INSERT INTO "profiles" ("id", "email")
          VALUES ('00000000-0000-0000-0000-000000000001', 'legacy@example.com');

          INSERT INTO "listings" (
            "id", "owner_id", "title", "listing_type", "property_type", "room_type",
            "price_monthly", "city", "move_in_date", "bedrooms", "bathrooms"
          ) VALUES (
            '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
            'Legacy housing listing', 'sublet', 'apartment', 'private_room', 1800, 'Los Angeles',
            CURRENT_DATE, 1, 1
          );
        `);
      }
    }
  }, 30_000);

  afterAll(() => {
    dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS \"${databaseName}\" WITH (FORCE)`]);
  });

  it("upgrades existing data while adding production-only database foundations", () => {
    expect(query(`SELECT array_to_string(enum_range(NULL::"ListingStatus"), ',')`)).toContain("SUSPENDED");
    expect(query(`SELECT "email" FROM "User" WHERE "id" = 'existing-user'`)).toBe("existing@example.com");
    expect(query(`SELECT "title" FROM "Listing" WHERE "id" = 'existing-listing'`)).toBe("Existing listing");
    expect(query(`SELECT "title" FROM "listings" WHERE "id" = '00000000-0000-0000-0000-000000000002'`)).toBe("Legacy housing listing");
    expect(query(`SELECT "consumedAt" IS NOT NULL FROM "VerificationCode" WHERE "id" = 'existing-code'`)).toBe("t");

    expect(() => executeSql(`UPDATE "listings" SET "title" = 'mutated' WHERE "id" = '00000000-0000-0000-0000-000000000002'`)).toThrow(
      /read-only/i
    );
    executeSql(`
      INSERT INTO "AuditEvent" ("id", "actorType", "action", "targetType", "outcome")
      VALUES ('audit-immutable', 'OPERATOR', 'BETA_INVITE_CREATED', 'BetaInvite', 'SUCCESS');
    `);
    expect(() => executeSql(`UPDATE "AuditEvent" SET "action" = 'mutated' WHERE "id" = 'audit-immutable'`)).toThrow(/immutable/i);
  });

  it("creates the new production records with their safe defaults", () => {
    executeSql(`
      INSERT INTO "BetaInvite" ("id", "normalizedEmail", "createdBy")
      VALUES ('invite-1', 'invite@example.com', 'operator@example.com');

      INSERT INTO "ListingMedia" ("id", "listingId", "kind")
      VALUES ('media-1', 'existing-listing', 'image');
    `);

    expect(query(`SELECT "deliveryStatus"::text FROM "VerificationCode" WHERE "id" = 'existing-code'`)).toBe("PENDING");
    expect(query(`SELECT "storageStatus"::text || ':' || "reviewStatus"::text FROM "ListingMedia" WHERE "id" = 'media-1'`)).toBe("PENDING:PENDING");
  });
});
