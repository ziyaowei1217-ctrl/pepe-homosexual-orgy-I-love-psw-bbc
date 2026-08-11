import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDisposablePostgres,
  DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS
} from "./support/disposable-postgres";

const runSmoke = process.env.RUN_DB_SMOKE === "1";
const describeSmoke = runSmoke ? describe : describe.skip;
const migrationsDirectory = join(__dirname, "../prisma/migrations");
const roommateMessagingMigration = "20260809090000_roommate_realtime_messaging";

describeSmoke("roommate messaging migration safety on PostgreSQL 16", () => {
  const emptyDatabase = createDisposablePostgres("roommate_messaging_empty");
  const existingRowsDatabase = createDisposablePostgres("roommate_messaging_existing");
  let emptyCreated = false;
  let existingCreated = false;

  beforeAll(() => {
    emptyCreated = true;
    emptyDatabase.create();
    existingCreated = true;
    existingRowsDatabase.create();
  }, 30_000);

  afterAll(() => {
    try {
      if (emptyCreated) emptyDatabase.drop();
    } finally {
      if (existingCreated) existingRowsDatabase.drop();
    }
  }, 30_000);

  it("deploys the current migration set on an empty database", () => {
    emptyDatabase.migrateDeploy();

    expect(query(emptyDatabase.databaseName, `SELECT current_setting('server_version_num')`)).toMatch(/^16/);
    expect(
      query(
        emptyDatabase.databaseName,
        `SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`
      )
    ).toBe(String(migrations().length));
    expect(tableCount(emptyDatabase.databaseName)).toBe("4");
    expect(readCursorColumnCount(emptyDatabase.databaseName)).toBe("2");
  }, 30_000);

  it("preserves an ownerless profile while adding messaging tables and read cursors", () => {
    const migrationNames = migrations();
    const splitAt = migrationNames.indexOf(roommateMessagingMigration);
    expect(splitAt).toBeGreaterThan(0);

    for (const migration of migrationNames.slice(0, splitAt)) {
      applyMigration(existingRowsDatabase.databaseName, migration);
    }

    executeSql(
      existingRowsDatabase.databaseName,
      `
        INSERT INTO "RoommateProfile" (
          "id", "name", "age", "role", "image", "match", "budget", "commute", "tags"
        ) VALUES (
          'ownerless-before-messaging', 'Legacy ownerless profile', 24, 'Student',
          'https://example.test/ownerless.jpg', 88, '$1,700/month', '20 minutes', ARRAY['legacy']
        );
      `
    );

    for (const migration of migrationNames.slice(splitAt)) {
      applyMigration(existingRowsDatabase.databaseName, migration);
    }

    expect(
      query(
        existingRowsDatabase.databaseName,
        `SELECT "ownerId" IS NULL FROM "RoommateProfile" WHERE "id" = 'ownerless-before-messaging'`
      )
    ).toBe("t");
    expect(tableCount(existingRowsDatabase.databaseName)).toBe("4");
    expect(readCursorColumnCount(existingRowsDatabase.databaseName)).toBe("2");
  }, 30_000);
});

function migrations() {
  return readdirSync(migrationsDirectory)
    .filter((name) => existsSync(join(migrationsDirectory, name, "migration.sql")))
    .sort();
}

function applyMigration(databaseName: string, migration: string) {
  executeSql(databaseName, readFileSync(join(migrationsDirectory, migration, "migration.sql"), "utf8"));
}

function executeSql(databaseName: string, sql: string) {
  dockerPsql(databaseName, [], sql);
}

function query(databaseName: string, sql: string) {
  return dockerPsql(databaseName, ["-tAc", sql]);
}

function tableCount(databaseName: string) {
  return query(
    databaseName,
    `
      SELECT COUNT(*)
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'RoommateMatch',
          'RoommateConversation',
          'RoommateConversationMember',
          'RoommateMessage'
        )
    `
  );
}

function readCursorColumnCount(databaseName: string) {
  return query(
    databaseName,
    `
      SELECT COUNT(*)
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'RoommateConversationMember'
        AND column_name IN ('lastReadMessageId', 'lastReadAt')
    `
  );
}

function dockerPsql(databaseName: string, args: string[], input?: string) {
  const result = spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "sublet-pipeline-db",
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "sublet",
      "-d",
      databaseName,
      ...args
    ],
    { encoding: "utf8", input, timeout: DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS }
  );
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
