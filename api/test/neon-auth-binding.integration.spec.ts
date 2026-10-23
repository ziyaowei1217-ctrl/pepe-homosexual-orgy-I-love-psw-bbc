import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service";
import { getNeonAuthConfig } from "../src/auth/auth-provider";
import { NeonAuthService } from "../src/auth/neon-auth.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("neon_identity");
const config = getNeonAuthConfig({ AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: "https://ep-database-test.neonauth.us-east-2.aws.neon.tech/neondb/auth", PUBLIC_BETA_SIGNUP: "true" })!;

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("actual PostgreSQL external identity binding", () => {
  let prisma: PrismaService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", database.databaseUrl);
    prisma = new PrismaService(); await prisma.$connect();
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); vi.unstubAllEnvs(); database.drop(); });
  function service(subject: string, email: string, publicSignup = true) {
    return new NeonAuthService(prisma, new JwtService({ secret: "integration-test-secret-at-least-32-characters" }),
      { verify: async () => ({ issuer: config.issuer, subject, email, name: "Verified test identity", expiresAt: Date.now() + 900_000 }) } as never,
      { ...config, publicSignup });
  }
  it("serializes concurrent exchanges into one immutable identity and account", async () => {
    const bridge = service("concurrent-subject", "concurrent@example.test");
    const responses = await Promise.all(Array.from({ length: 8 }, () => bridge.exchange("verified-by-fixture")));
    expect(new Set(responses.map(response => response.user.id)).size).toBe(1);
    expect(await prisma.externalAuthIdentity.count({ where: { subject: "concurrent-subject" } })).toBe(1);
    expect(await prisma.user.count({ where: { email: "concurrent@example.test" } })).toBe(1);
  }, 10_000);
  it("never remaps an established subject or links a recycled email to a different subject", async () => {
    const original = await service("stable-subject", "original@example.test").exchange("verified-by-fixture");
    const other = await prisma.user.create({ data: { email: "other@example.test", role: "ADMIN" } });
    await expect(service("stable-subject", other.email).exchange("verified-by-fixture")).rejects.toMatchObject({ status: 401 });
    await expect(service("new-subject", "original@example.test").exchange("verified-by-fixture")).rejects.toMatchObject({ status: 401 });
    expect((await prisma.externalAuthIdentity.findUniqueOrThrow({ where: { provider_issuer_subject: { provider: "neon", issuer: config.issuer, subject: "stable-subject" } } })).userId).toBe(original.user.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.id } })).role).toBe("ADMIN");
  });
  it("claims an invitation atomically and creates no account when the invitation is missing", async () => {
    await expect(service("closed-subject", "closed@example.test", false).exchange("verified-by-fixture")).rejects.toMatchObject({ status: 401 });
    expect(await prisma.user.count({ where: { email: "closed@example.test" } })).toBe(0);
    await prisma.betaInvite.create({ data: { normalizedEmail: "invited@example.test", createdBy: "test-operator-attribution" } });
    await service("invited-subject", "invited@example.test", false).exchange("verified-by-fixture");
    expect((await prisma.betaInvite.findUniqueOrThrow({ where: { normalizedEmail: "invited@example.test" } })).claimedAt).toBeInstanceOf(Date);
  });
});
