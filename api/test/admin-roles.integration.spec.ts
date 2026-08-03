import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { PrismaClient, UserRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { AdminRolesService } from "../src/operations/admin-roles.service";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const databaseName = `admin_roles_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = `postgresql://sublet:sublet@localhost:5432/${databaseName}?schema=public`;

function dockerPsql(args: string[]) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

function migrateDeploy() {
  const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
    cwd: join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl }
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed: ${result.stderr || result.stdout}`);
  }
}

describeDatabase("administrator role concurrency", () => {
  let prisma: PrismaClient | undefined;
  let databaseCreated = false;

  beforeAll(async () => {
    dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE "${databaseName}"`]);
    databaseCreated = true;
    expect(dockerPsql(["-d", databaseName, "-tAc", "SHOW server_version_num"])).toMatch(/^16/);
    migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
  }, 30_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (databaseCreated) {
      dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`]);
    }
  });

  it("serializes simultaneous revocations so one administrator remains", async () => {
    if (!prisma) throw new Error("test database was not initialized");
    const firstEmail = "first-admin@example.com";
    const secondEmail = "second-admin@example.com";
    await prisma.user.createMany({
      data: [
        { email: firstEmail, role: UserRole.ADMIN },
        { email: secondEmail, role: UserRole.ADMIN }
      ]
    });
    const service = new AdminRolesService(prisma as never, new AuditService());

    const results = await Promise.allSettled([
      service.revoke({ email: firstEmail, actorEmail: "ops@example.com", reason: "Concurrent rotation A" }),
      service.revoke({ email: secondEmail, actorEmail: "ops@example.com", reason: "Concurrent rotation B" })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { response: { code: "LAST_ADMIN_REQUIRED" } }
    });
    expect(await prisma.user.count({ where: { role: UserRole.ADMIN } })).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { action: "ADMIN_ROLE_REVOKE_BLOCKED", outcome: "BLOCKED" } })
    ).toBe(1);
  });
});
