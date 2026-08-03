import "reflect-metadata";
import { JwtModule } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { AuthModule } from "../src/auth/auth.module";
import { AuthService, type AuthServiceOptions } from "../src/auth/auth.service";
import { AUTH_OPTIONS, EMAIL_SENDER } from "../src/auth/auth.tokens";
import type { EmailSender } from "../src/email/email-sender";
import { PrismaModule } from "../src/prisma/prisma.module";

describe("AuthModule dependency injection", () => {
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
    await moduleRef.close();
  });
});
