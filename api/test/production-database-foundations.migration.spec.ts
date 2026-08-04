import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const runDatabaseMigrationTests = process.env.RUN_DB_SMOKE === "1";
const describeMigration = runDatabaseMigrationTests ? describe : describe.skip;
const migrationsDir = join(__dirname, "../prisma/migrations");
const databaseName = `production_foundations_${randomUUID().replaceAll("-", "")}`;
const deployDatabaseName = `production_foundations_deploy_${randomUUID().replaceAll("-", "")}`;
const productionFoundationsMigration = "20260803120000_production_database_foundations";
const operatorAttributionRedactionMigration = "20260803122000_redact_beta_invite_operator_attribution";

describe("operator attribution redaction migration source", () => {
  it("installs non-validating checks before targeted cleanup, then validates atomically", () => {
    const sql = readFileSync(
      join(migrationsDir, operatorAttributionRedactionMigration, "migration.sql"),
      "utf8"
    );
    const addConstraint = sql.indexOf("NOT VALID");
    const cleanup = sql.indexOf('UPDATE "BetaInvite"');
    const validate = sql.indexOf("VALIDATE CONSTRAINT");

    expect(sql.trimStart().toUpperCase()).toMatch(/^BEGIN;/);
    expect(sql.trimEnd().toUpperCase()).toMatch(/COMMIT;$/);
    expect(addConstraint).toBeGreaterThan(-1);
    expect(addConstraint).toBeLessThan(cleanup);
    expect(cleanup).toBeLessThan(validate);
    expect(sql).toContain("WHERE");
  });
});

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

function queryDeployDatabase(sql: string) {
  return dockerPsql(["-d", deployDatabaseName, "-tAc", sql]);
}

function runPrismaMigrate(database: string, ...args: string[]) {
  const result = spawnSync("pnpm", ["exec", "prisma", "migrate", ...args, "--schema", "prisma/schema.prisma"], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://sublet:sublet@localhost:5432/${database}?schema=public`
    }
  });

  if (result.status !== 0) {
    throw new Error(`prisma migrate ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

describeMigration("production database foundations migration", () => {
  beforeAll(() => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE \"${databaseName}\"`]);
    expect(query("SHOW server_version_num")).toMatch(/^16/);

    const migrations = readdirSync(migrationsDir).sort();
    for (const migration of migrations) {
      // These rows emulate data present before the additive production migration.
      if (migration === productionFoundationsMigration) {
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

      if (migration === operatorAttributionRedactionMigration) {
        executeSql(`
          INSERT INTO "BetaInvite" (
            "id", "normalizedEmail", "createdBy", "reason", "revokedAt", "revokedBy", "revocationReason"
          ) VALUES (
            'legacy-private-operator-invite', 'invite-target@example.com', 'creator@example.com',
            'Legacy cohort', CURRENT_TIMESTAMP, 'revoker@example.com', 'Legacy withdrawal'
          ), (
            'legacy-safe-operator-invite', 'safe-target@example.com', 'SYSTEM',
            'Legacy safe cohort', CURRENT_TIMESTAMP, 'SYSTEM', 'Legacy safe withdrawal'
          );
        `);
      }

      executeSql(readFileSync(join(migrationsDir, migration, "migration.sql"), "utf8"));
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
    expect(
      query(
        `SELECT "createdBy" || ':' || "revokedBy" FROM "BetaInvite" WHERE "id" = 'legacy-private-operator-invite'`
      )
    ).toBe("[REDACTED]:[REDACTED]");
    expect(
      query(
        `SELECT "createdBy" || ':' || "revokedBy" FROM "BetaInvite" WHERE "id" = 'legacy-safe-operator-invite'`
      )
    ).toBe("SYSTEM:SYSTEM");

    expect(() => executeSql(`UPDATE "listings" SET "title" = 'mutated' WHERE "id" = '00000000-0000-0000-0000-000000000002'`)).toThrow(
      /read-only/i
    );
    expect(() => executeSql(`
      INSERT INTO "listings" (
        "id", "owner_id", "title", "listing_type", "property_type", "room_type",
        "price_monthly", "city", "move_in_date", "bedrooms", "bathrooms"
      ) VALUES (
        '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
        'Blocked legacy listing', 'sublet', 'apartment', 'private_room', 1900, 'Los Angeles',
        CURRENT_DATE, 1, 1
      )
    `)).toThrow(/read-only/i);
    expect(() => executeSql(`DELETE FROM "listings" WHERE "id" = '00000000-0000-0000-0000-000000000002'`)).toThrow(/read-only/i);
    executeSql(`
      INSERT INTO "AuditEvent" (
        "id", "actorType", "actorEmail", "action", "targetType", "targetId", "outcome"
      ) VALUES (
        'audit-admin-role-granted', 'OPERATOR', 'operator@example.com',
        'ADMIN_ROLE_GRANTED', 'User', 'existing-user', 'SUCCESS'
      );
    `);
    expect(() => executeSql(`UPDATE "AuditEvent" SET "action" = 'mutated' WHERE "id" = 'audit-admin-role-granted'`)).toThrow(/immutable/i);
    expect(() => executeSql(`DELETE FROM "AuditEvent" WHERE "id" = 'audit-admin-role-granted'`)).toThrow(/immutable/i);
    expect(() => executeSql(`TRUNCATE TABLE "AuditEvent"`)).toThrow(/immutable/i);
  });

  it("creates the new production records with their safe defaults", () => {
    expect(() =>
      executeSql(`
        INSERT INTO "BetaInvite" ("id", "normalizedEmail", "createdBy")
        VALUES ('unsafe-operator-attribution', 'unsafe-target@example.com', 'operator@example.com');
      `)
    ).toThrow(/BetaInvite_createdBy_no_full_email/i);

    executeSql(`
      INSERT INTO "BetaInvite" ("id", "normalizedEmail", "createdBy")
      VALUES ('invite-1', 'invite@example.com', '[REDACTED]');

      INSERT INTO "ListingMedia" ("id", "listingId", "kind")
      VALUES ('media-1', 'existing-listing', 'image');
    `);

    expect(query(`SELECT "deliveryStatus"::text FROM "VerificationCode" WHERE "id" = 'existing-code'`)).toBe("PENDING");
    expect(query(`SELECT "storageStatus"::text || ':' || "reviewStatus"::text FROM "ListingMedia" WHERE "id" = 'media-1'`)).toBe("PENDING:PENDING");
  });
});

describeMigration("production database foundations migrate deploy smoke", () => {
  beforeAll(() => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE \"${deployDatabaseName}\"`]);
  });

  afterAll(() => {
    dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS \"${deployDatabaseName}\" WITH (FORCE)`]);
  });

  it("uses Prisma migrate deploy to record every migration on an empty PostgreSQL 16 database", () => {
    expect(queryDeployDatabase("SHOW server_version_num")).toMatch(/^16/);

    runPrismaMigrate(deployDatabaseName, "deploy");
    const status = runPrismaMigrate(deployDatabaseName, "status");

    expect(status).toContain("Database schema is up to date");
    expect(queryDeployDatabase(`SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`)).toBe(
      String(readdirSync(migrationsDir).length)
    );
  }, 30_000);
});
