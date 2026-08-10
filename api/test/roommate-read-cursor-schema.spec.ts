import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const describeDatabase = process.env.RUN_DB_SMOKE === "1" ? describe : describe.skip;
const databaseName = `roommate_read_cursor_${randomUUID().replaceAll("-", "")}`;

describeDatabase("roommate read cursor migration", () => {
  beforeAll(() => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE \"${databaseName}\"`]);
    const prisma = join(__dirname, "..", "node_modules", ".bin", "prisma");
    const result = spawnSync(prisma, ["migrate", "deploy", "--schema", "prisma/schema.prisma"], {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: `postgresql://sublet:sublet@localhost:5432/${databaseName}?schema=public`
      }
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  }, 30_000);

  afterAll(() => {
    dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS \"${databaseName}\" WITH (FORCE)`]);
  });

  it("preserves existing memberships while persisting nullable read cursors", () => {
    executeSql(`
      INSERT INTO "User" ("id", "email", "updatedAt")
      VALUES ('read-a', 'read-a@example.test', CURRENT_TIMESTAMP), ('read-b', 'read-b@example.test', CURRENT_TIMESTAMP);
      INSERT INTO "RoommateMatch" ("id", "firstUserId", "secondUserId", "updatedAt")
      VALUES ('read-match', 'read-a', 'read-b', CURRENT_TIMESTAMP);
      INSERT INTO "RoommateConversation" ("id", "matchId", "updatedAt")
      VALUES ('read-conversation', 'read-match', CURRENT_TIMESTAMP);
      INSERT INTO "RoommateConversationMember" ("id", "conversationId", "userId", "updatedAt")
      VALUES ('read-member', 'read-conversation', 'read-a', CURRENT_TIMESTAMP);
      INSERT INTO "RoommateMessage" ("id", "conversationId", "senderId", "clientMessageId", "body", "createdAt")
      VALUES ('read-message', 'read-conversation', 'read-b', 'read-client', 'Hello', '2026-08-09T00:00:01Z');
    `);

    expect(query(`SELECT "lastReadMessageId" IS NULL AND "lastReadAt" IS NULL FROM "RoommateConversationMember" WHERE "id" = 'read-member'`)).toBe("t");

    executeSql(`
      UPDATE "RoommateConversationMember"
      SET "lastReadMessageId" = 'read-message', "lastReadAt" = '2026-08-09T00:00:01Z'
      WHERE "id" = 'read-member';
    `);

    expect(query(`SELECT "lastReadMessageId" || '|' || "lastReadAt"::text FROM "RoommateConversationMember" WHERE "id" = 'read-member'`)).toMatch(/^read-message\|2026-08-09 00:00:01/);
  });
});

function dockerPsql(args: string[], input?: string) {
  const result = spawnSync("docker", ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args], {
    encoding: "utf8",
    input
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function executeSql(sql: string) {
  dockerPsql(["-d", databaseName], sql);
}

function query(sql: string) {
  return dockerPsql(["-d", databaseName, "-tAc", sql]);
}

