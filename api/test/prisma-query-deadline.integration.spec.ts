import { Prisma } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { HealthService } from "../src/health/health.service";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { PrismaService } from "../src/prisma/prisma.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("query_deadline");

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("actual PostgreSQL driver query deadlines", () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", database.databaseUrl);
    prisma = new PrismaService(); await prisma.$connect();
    await prisma.$executeRawUnsafe('CREATE TABLE "DeadlineProbe" (id TEXT PRIMARY KEY)');
  }, 30_000);
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await prisma?.$disconnect(); vi.unstubAllEnvs(); database.drop(); });

  it("terminates an accepted pg_sleep and permits a later query", async () => {
    const start = Date.now();
    await expect(prisma.$queryRaw`SELECT 1 FROM pg_sleep(6)`).rejects.toThrow();
    expect(Date.now() - start).toBeGreaterThanOrEqual(2_900);
    expect(Date.now() - start).toBeLessThan(4_500);
    await expect(prisma.$queryRaw`SELECT 1 AS value`).resolves.toEqual([{ value: 1 }]);
  }, 10_000);

  it("shares the actual readiness query across callers and recovers on a fresh connection", async () => {
    let slow = true;
    const query = vi.fn(() => slow ? prisma.$queryRaw`SELECT 1 FROM pg_sleep(6)` : prisma.$queryRaw`SELECT 1`);
    const service = new HealthService({ $queryRaw: query } as never, new MessagingInfrastructureHealth());
    const start = Date.now();
    const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => service.ready()));
    expect(outcomes.every(result => result.status === "rejected" && result.reason.getStatus() === 503)).toBe(true);
    expect(Date.now() - start).toBeLessThan(4_000);
    expect(query).toHaveBeenCalledTimes(1);
    slow = false; await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("aborts a timed-out transaction without committing its writes and recovers transactions", async () => {
    await expect(prisma.$transaction(async transaction => {
      await transaction.$executeRaw`INSERT INTO "DeadlineProbe" (id) VALUES ('discarded')`;
      await transaction.$queryRaw`SELECT 1 FROM pg_sleep(6)`;
    })).rejects.toThrow();
    expect(await prisma.$queryRaw`SELECT id FROM "DeadlineProbe" WHERE id = 'discarded'`).toEqual([]);
    await expect(prisma.$transaction(transaction => transaction.$queryRaw`SELECT 1 AS value`))
      .resolves.toEqual([{ value: 1 }]);
  }, 10_000);

  it("preserves model error mapping for unique constraints", async () => {
    await prisma.user.create({ data: { id: "deadline-user", email: "deadline@example.test" } });
    await expect(prisma.user.create({ data: { email: "deadline@example.test" } }))
      .rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    await prisma.user.create({ data: { id: "deadline-user-2", email: "deadline-2@example.test" } });
  });

  it("quotes a custom schema for unqualified raw queries", async () => {
    const name = 'deadline space\\quote"schema';
    const quoted = `"${name.replaceAll('"', '""')}"`;
    await prisma.$executeRawUnsafe(`CREATE SCHEMA ${quoted}`);
    const url = new URL(database.databaseUrl); url.searchParams.set("schema", name);
    vi.stubEnv("DATABASE_URL", url.href);
    const scoped = new PrismaService();
    try { await expect(scoped.$queryRaw`SELECT current_schema()::text AS value`).resolves.toEqual([{ value: name }]); }
    finally { await scoped.$disconnect(); vi.stubEnv("DATABASE_URL", database.databaseUrl); }
  });
});
