import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const runDatabaseMigrationTests = process.env.RUN_DB_SMOKE === "1";
const describeMigration = runDatabaseMigrationTests ? describe : describe.skip;
const databaseName = `roommate_messaging_${randomUUID().replaceAll("-", "")}`;

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

function runPrismaMigrate(...args: string[]) {
  const result = spawnSync("pnpm", ["exec", "prisma", "migrate", ...args, "--schema", "prisma/schema.prisma"], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: `postgresql://sublet:sublet@localhost:5432/${databaseName}?schema=public`
    }
  });

  if (result.status !== 0) {
    throw new Error(`prisma migrate ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
}

function createConversationGraph() {
  executeSql(`
    DELETE FROM "RoommateMessage";
    DELETE FROM "RoommateConversationMember";
    DELETE FROM "RoommateConversation";
    DELETE FROM "RoommateMatch";
    DELETE FROM "RoommateProfile";
    DELETE FROM "User" WHERE "id" IN ('user-a', 'user-b');

    INSERT INTO "RoommateProfile" ("id", "name", "age", "role", "image", "match", "budget", "commute", "tags")
    VALUES ('legacy-candidate', 'Legacy candidate', 24, 'Student', 'https://example.test/legacy.jpg', 80, '$1,500', '20 min', ARRAY['quiet']);

    INSERT INTO "User" ("id", "email", "updatedAt")
    VALUES
      ('user-a', 'user-a@example.test', CURRENT_TIMESTAMP),
      ('user-b', 'user-b@example.test', CURRENT_TIMESTAMP);

    INSERT INTO "RoommateProfile" ("id", "name", "age", "role", "image", "match", "budget", "commute", "tags", "ownerId")
    VALUES
      ('profile-a', 'User A', 24, 'Student', 'https://example.test/a.jpg', 90, '$1,500', '20 min', ARRAY['quiet'], 'user-a'),
      ('profile-b', 'User B', 25, 'Student', 'https://example.test/b.jpg', 91, '$1,600', '25 min', ARRAY['clean'], 'user-b');

    INSERT INTO "RoommateMatch" ("id", "firstUserId", "secondUserId", "updatedAt")
    VALUES ('match-a-b', 'user-a', 'user-b', CURRENT_TIMESTAMP);

      INSERT INTO "RoommateConversation" ("id", "matchId", "updatedAt")
      VALUES ('conversation-a-b', 'match-a-b', CURRENT_TIMESTAMP);

      INSERT INTO "RoommateConversationMember" ("id", "conversationId", "userId", "updatedAt")
      VALUES
        ('member-a', 'conversation-a-b', 'user-a', CURRENT_TIMESTAMP),
        ('member-b', 'conversation-a-b', 'user-b', CURRENT_TIMESTAMP);

    INSERT INTO "RoommateMessage" ("id", "conversationId", "senderId", "clientMessageId", "body")
    VALUES ('message-a', 'conversation-a-b', 'user-a', 'client-message-a', 'Hello');
  `);
}

describeMigration("roommate realtime messaging migration", () => {
  beforeAll(() => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE \"${databaseName}\"`]);
    runPrismaMigrate("deploy");
  }, 30_000);

  beforeEach(() => {
    createConversationGraph();
  });

  afterAll(() => {
    dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS \"${databaseName}\" WITH (FORCE)`]);
  });

  it("keeps ownerless candidates migratable while persisting a two-member conversation", () => {
    expect(query(`SELECT COUNT(*) FROM "RoommateConversationMember" WHERE "conversationId" = 'conversation-a-b'`)).toBe("2");
    expect(query(`SELECT "body" FROM "RoommateMessage" WHERE "id" = 'message-a'`)).toBe("Hello");
  });

  it("enforces normalized matches, one conversation, one membership, and idempotent sender messages", () => {
    expect(() =>
      executeSql(`
        INSERT INTO "RoommateMatch" ("id", "firstUserId", "secondUserId", "updatedAt")
        VALUES ('duplicate-match', 'user-a', 'user-b', CURRENT_TIMESTAMP);
      `)
    ).toThrow(/unique/i);

    expect(() =>
      executeSql(`
        INSERT INTO "RoommateConversation" ("id", "matchId", "updatedAt")
        VALUES ('duplicate-conversation', 'match-a-b', CURRENT_TIMESTAMP);
      `)
    ).toThrow(/unique/i);

    expect(() =>
      executeSql(`
        INSERT INTO "RoommateConversationMember" ("id", "conversationId", "userId", "updatedAt")
        VALUES ('duplicate-member', 'conversation-a-b', 'user-a', CURRENT_TIMESTAMP);
      `)
    ).toThrow(/unique/i);

    expect(() =>
      executeSql(`
        INSERT INTO "RoommateMessage" ("id", "conversationId", "senderId", "clientMessageId", "body")
        VALUES ('duplicate-message', 'conversation-a-b', 'user-a', 'client-message-a', 'Retry');
      `)
    ).toThrow(/unique/i);

    expect(() =>
      executeSql(`
        INSERT INTO "RoommateMessage" ("id", "conversationId", "senderId", "clientMessageId", "body")
        VALUES ('unknown-sender-message', 'conversation-a-b', 'missing-user', 'client-message-b', 'Blocked');
      `)
    ).toThrow(/foreign key/i);
  });
});
