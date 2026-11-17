import { JwtService } from "@nestjs/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AuditService } from "../src/audit/audit.service";
import { AuthRateLimiter, InMemoryRateLimitStore } from "../src/auth/auth-rate-limit";
import type { NeonAuthConfig } from "../src/auth/auth-provider";
import { isPhoneAccountEmail, PhoneAuthService } from "../src/auth/phone-auth.service";
import type { PhoneVerificationProvider } from "../src/auth/phone-verification-provider";
import { PrismaService } from "../src/prisma/prisma.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("phone_sign_up");
const approving: PhoneVerificationProvider = {
  name: "twilio-verify",
  start: async () => ({ status: "pending" }) as never,
  check: async () => "approved"
};

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("phone sign-up on PostgreSQL", () => {
  let prisma: PrismaService;
  let phone: PhoneAuthService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", database.databaseUrl);
    prisma = new PrismaService(); await prisma.$connect();
    phone = new PhoneAuthService(
      prisma,
      new JwtService({ secret: "integration-test-secret-at-least-32-characters" }),
      new AuditService(),
      { enabled: true, regions: ["US_CA"], provider: approving },
      new AuthRateLimiter({ store: new InMemoryRateLimitStore(), nodeEnv: "test", identifierHashSecret: "integration-identifier-secret" }),
      { publicSignup: true } as NeonAuthConfig
    );
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); vi.unstubAllEnvs(); database.drop(); });

  it("creates one account for a new number even when the code is verified several times at once", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => phone.verifySignInCode("+14155552671", "123456")));
    expect(new Set(results.map((result) => result.user.id)).size).toBe(1);
    expect(results.filter((result) => result.isNewUser)).toHaveLength(1);
    expect(isPhoneAccountEmail(results[0].user.email)).toBe(true);
    expect(await prisma.phoneIdentity.count({ where: { phoneNumber: "+14155552671" } })).toBe(1);
    expect(await prisma.user.count({ where: { id: results[0].user.id } })).toBe(1);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { email: results[0].user.email } });
    expect(profile.phoneVerified).toBe(true);
    expect(await prisma.auditEvent.count({ where: { action: "PHONE_SIGN_UP", targetId: results[0].user.id } })).toBe(1);

    const again = await phone.verifySignInCode("+14155552671", "123456");
    expect(again).toMatchObject({ isNewUser: false, user: { id: results[0].user.id } });
  });
});
