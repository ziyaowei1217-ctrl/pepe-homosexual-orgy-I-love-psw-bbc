import { afterEach, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { HealthService } from "../src/health/health.service";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { PaymentOperationsService } from "../src/payments/payment-operations.service";
import { createBoundedPostgresAdapter } from "../src/prisma/bounded-postgres";
import { postgresQueryFixture } from "./helpers/protocol-fixtures";

afterEach(() => vi.unstubAllEnvs());

describe("installed Prisma driver transport deadline", () => {
  it("settles an accepted stalled query, shares readiness work, and permits later queries and recovery scans", async () => {
    const fixture = await postgresQueryFixture();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", fixture.url);
    const prisma = new PrismaService();
    try {
      const health = new HealthService(prisma, new MessagingInfrastructureHealth());
      const started = Date.now();
      const attempts = await Promise.allSettled(Array.from({ length: 12 }, () => health.ready()));
      expect(Date.now() - started).toBeLessThan(4_500);
      expect(attempts.every(result => result.status === "rejected" && result.reason.getStatus() === 503)).toBe(true);
      expect(fixture.state.executions).toBe(1);
      expect(fixture.state.closedConnections).toBe(1);
      fixture.state.stall = false;
      await expect(health.ready()).resolves.toMatchObject({ status: "ok" });
      expect(fixture.state.executions).toBe(2);
      let scans = 0;
      const operations = new PaymentOperationsService({ paymentOperation: { findMany: async () => {
        scans += 1; await prisma.$queryRaw`SELECT 1`; return [];
      } } } as never, { execution: "remote" } as never);
      fixture.state.stall = true;
      await operations.runPending();
      fixture.state.stall = false;
      await operations.runPending();
      expect(scans).toBe(2);
      expect(fixture.state.executions).toBe(4);
    } finally { await prisma.$disconnect(); await fixture.close(); }
  }, 15_000);

  it("aborts a real transaction query and permits a later transaction on a fresh connection", async () => {
    const fixture = await postgresQueryFixture();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", fixture.url);
    const prisma = new PrismaService();
    try {
      const start = Date.now();
      await expect(prisma.$transaction(transaction => transaction.$queryRaw`SELECT 1`)).rejects.toThrow();
      expect(Date.now() - start).toBeLessThan(4_500);
      expect(fixture.state.closedConnections).toBe(1);
      fixture.state.stall = false;
      await expect(prisma.$transaction(transaction => transaction.$queryRaw`SELECT 1`)).resolves.toEqual([{ one: 1 }]);
      expect(fixture.state.connections).toBe(2);
      expect(fixture.state.sql.filter(sql => /^COMMIT/.test(sql))).toHaveLength(1);
    } finally { await fixture.close(); await prisma.$disconnect(); }
  }, 8_000);

  it("bounds pool acquisition, same-client queued queries, and active pool shutdown", async () => {
    const fixture = await postgresQueryFixture();
    const { pool } = createBoundedPostgresAdapter({ NODE_ENV: "test", DATABASE_URL: fixture.url });
    const client = await pool.connect();
    const started = Date.now();
    const queries = Promise.allSettled([client.query("SELECT 1"), client.query("SELECT 1")]);
    const queued = pool.connect().then(connection => { connection.release(); return false; }, () => true);
    const ending = pool.end();
    try {
      const outcomes = await queries; client.release();
      await ending;
      expect(outcomes.every(result => result.status === "rejected")).toBe(true);
      expect(await queued).toBe(true);
      expect(Date.now() - started).toBeLessThan(4_500);
      expect(fixture.state.executions).toBe(1);
      expect(pool.totalCount).toBe(0); expect(pool.waitingCount).toBe(0);
    } finally { await fixture.close(); }
  }, 8_000);

  it("bounds actual disconnect and retains query deadlines after implicit reconnect", async () => {
    const fixture = await postgresQueryFixture();
    vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", fixture.url);
    const prisma = new PrismaService();
    try {
      const start = Date.now();
      const pending = prisma.$queryRaw`SELECT 1`.then(() => false, () => true);
      while (!fixture.state.executions) await new Promise(resolve => setTimeout(resolve, 5));
      await prisma.$disconnect();
      expect(await pending).toBe(true); expect(Date.now() - start).toBeLessThan(4_500);
      fixture.state.stall = false; await expect(prisma.$queryRaw`SELECT 1`).resolves.toEqual([{ one: 1 }]);
      fixture.state.stall = true;
      const again = Date.now(); await expect(prisma.$queryRaw`SELECT 1`).rejects.toThrow();
      expect(Date.now() - again).toBeLessThan(4_500);
      expect(fixture.state.closedConnections).toBe(2);
    } finally { await fixture.close(); await prisma.$disconnect(); }
  }, 10_000);

});
