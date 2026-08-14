import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres(`roommate_teams_${randomUUID()}`);

describeDatabase("roommate team schema", () => {
  beforeAll(() => {
    database.create();
    database.migrateDeploy();
    execute(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES
        ('user-a', 'a@example.com', NOW()),
        ('user-b', 'b@example.com', NOW()),
        ('user-c', 'c@example.com', NOW());

      INSERT INTO "RoommateMatch" ("id", "firstUserId", "secondUserId", "updatedAt")
      VALUES ('match-ab', 'user-a', 'user-b', NOW());
    `);
  }, 30_000);

  afterAll(() => {
    database.drop();
  });

  it("persists exact invite and team states", () => {
    expect(query(`SELECT array_to_string(enum_range(NULL::"RoommateTeamStatus"), ',')`)).toBe(
      "ACTIVE,DISSOLVED"
    );
    expect(query(`SELECT array_to_string(enum_range(NULL::"RoommateTeamInviteStatus"), ',')`)).toBe(
      "PENDING,ACCEPTED,DECLINED,CANCELLED,EXPIRED"
    );
  });

  it("prevents one user from joining two active teams", () => {
    execute(`
      INSERT INTO "RoommateTeam" ("id", "updatedAt") VALUES
        ('team-1', NOW()),
        ('team-2', NOW());
      INSERT INTO "RoommateTeamMember" ("id", "teamId", "userId", "snapshot")
      VALUES ('member-1', 'team-1', 'user-a', '{}'::jsonb);
    `);

    expect(() => execute(`
      INSERT INTO "RoommateTeamMember" ("id", "teamId", "userId", "snapshot")
      VALUES ('member-conflict', 'team-2', 'user-a', '{}'::jsonb);
    `)).toThrow(/RoommateTeamMember_one_active_per_user/);

    execute(`
      UPDATE "RoommateTeamMember" SET "active" = FALSE, "leftAt" = NOW()
      WHERE "id" = 'member-1';
      INSERT INTO "RoommateTeamMember" ("id", "teamId", "userId", "snapshot")
      VALUES ('member-2', 'team-2', 'user-a', '{}'::jsonb);
    `);
    expect(query(`SELECT "teamId" FROM "RoommateTeamMember" WHERE "id" = 'member-2'`)).toBe("team-2");
  });

  it("allows only one pending invite per reciprocal match and rejects self-invites", () => {
    execute(`
      INSERT INTO "RoommateTeamInvite" (
        "id", "matchId", "inviterId", "inviteeId", "expiresAt", "updatedAt"
      ) VALUES (
        'invite-1', 'match-ab', 'user-a', 'user-b', NOW() + INTERVAL '7 days', NOW()
      );
    `);

    expect(() => execute(`
      INSERT INTO "RoommateTeamInvite" (
        "id", "matchId", "inviterId", "inviteeId", "expiresAt", "updatedAt"
      ) VALUES (
        'invite-2', 'match-ab', 'user-b', 'user-a', NOW() + INTERVAL '7 days', NOW()
      );
    `)).toThrow(/RoommateTeamInvite_one_pending_per_match/);

    execute(`UPDATE "RoommateTeamInvite" SET "status" = 'DECLINED' WHERE "id" = 'invite-1'`);
    expect(() => execute(`
      INSERT INTO "RoommateTeamInvite" (
        "id", "matchId", "inviterId", "inviteeId", "expiresAt", "updatedAt"
      ) VALUES (
        'invite-self', 'match-ab', 'user-a', 'user-a', NOW() + INTERVAL '7 days', NOW()
      );
    `)).toThrow(/RoommateTeamInvite_distinct_users/);
  });
});

function execute(sql: string) {
  runPsql(["-d", database.databaseName], sql);
}

function query(sql: string) {
  return runPsql(["-d", database.databaseName, "-tAc", sql]);
}

function runPsql(args: string[], input?: string) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8", input, timeout: 10_000 }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
