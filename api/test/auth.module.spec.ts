import "reflect-metadata";
import { JwtModule } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AuthModule, createAuthServiceOptions } from "../src/auth/auth.module";
import { AdminGuard } from "../src/auth/admin.guard";
import { AuthService, type AuthServiceOptions } from "../src/auth/auth.service";
import { AUTH_OPTIONS, EMAIL_SENDER } from "../src/auth/auth.tokens";
import { EMAIL_PROVIDER_TOTAL_TIMEOUT_MS, type EmailSender } from "../src/email/email-sender";
import { PrismaModule } from "../src/prisma/prisma.module";

describe("AuthModule dependency injection", () => {
  it("rejects local administrator allowlists in production", () => {
    expect(() =>
      createAuthServiceOptions(
        {
          otpHashSecret: "otp-test-secret-that-is-at-least-32-bytes",
          securityIdentifierHashSecret: "identifier-test-secret-at-least-32-bytes",
          codeTtlMs: 600_000,
          codeMaxAttempts: 5,
          codeCooldownMs: 60_000,
          trustedProxyHops: 0
        },
        "production",
        "admin@example.com"
      )
    ).toThrow("LOCAL_ADMIN_EMAILS is not allowed in production");
  });

  it("keeps the production LOGIN response floor beyond the entire provider timeout budget", () => {
    const options = createAuthServiceOptions(
      {
        otpHashSecret: "otp-test-secret-that-is-at-least-32-bytes",
        securityIdentifierHashSecret: "identifier-test-secret-at-least-32-bytes",
        codeTtlMs: 600_000,
        codeMaxAttempts: 5,
        codeCooldownMs: 60_000,
        trustedProxyHops: 0
      },
      "production",
      ""
    );

    expect(options.responseJitterMs).toBeGreaterThan(0);
    expect(options.responseMinimumMs).toBeGreaterThanOrEqual(
      EMAIL_PROVIDER_TOTAL_TIMEOUT_MS + options.responseJitterMs
    );
  });

  it("resolves AuthService from explicit email-sender and typed auth-options tokens", async () => {
    const emailSender: EmailSender = {
      async sendVerificationCode() {
        return { providerMessageId: "test-provider" };
      }
    };
    const authOptions: AuthServiceOptions = {
      nodeEnv: "test",
      otpHashSecret: "otp-test-secret-that-is-at-least-32-bytes",
      codeTtlMs: 600_000,
      codeMaxAttempts: 5,
      codeRequestCooldownMs: 60_000,
      localAdminEmails: "",
      responseMinimumMs: 0,
      responseJitterMs: 0
    };
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ global: true, secret: "test-secret" }), PrismaModule, AuthModule]
    })
      .overrideProvider(EMAIL_SENDER)
      .useValue(emailSender)
      .overrideProvider(AUTH_OPTIONS)
      .useValue(authOptions)
      .compile();

    expect(moduleRef.get(EMAIL_SENDER)).toBe(emailSender);
    expect(moduleRef.get(AUTH_OPTIONS)).toBe(authOptions);
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(AdminGuard)).toBeInstanceOf(AdminGuard);
    await moduleRef.close();
  });
});
