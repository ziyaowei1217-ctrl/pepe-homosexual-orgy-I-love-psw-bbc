import { describe, expect, it, vi } from "vitest";

import { getAuthSecurityConfig, getJwtSecret } from "../src/config/env";
import { ConsoleEmailSender, createEmailSender } from "../src/email/email-sender";

describe("environment config", () => {
  it("uses the development fallback outside production", () => {
    expect(getJwtSecret({ nodeEnv: "development" })).toBe("dev-change-me");
  });

  it("requires a real JWT secret in production", () => {
    expect(() => getJwtSecret({ nodeEnv: "production" })).toThrow("JWT_SECRET is required in production");
    expect(() => getJwtSecret({ nodeEnv: "production", jwtSecret: "dev-change-me" })).toThrow(
      "JWT_SECRET is required in production"
    );
  });

  it("accepts explicit production secrets", () => {
    expect(getJwtSecret({ nodeEnv: "production", jwtSecret: "prod-secret-value" })).toBe("prod-secret-value");
  });

  it("validates verification lifetimes and production security secrets", () => {
    expect(
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "otp-production-secret-that-is-at-least-32-characters",
        securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters",
        codeTtlSeconds: "600",
        codeMaxAttempts: "5",
        codeCooldownSeconds: "60",
        trustedProxyHops: "2"
      })
    ).toMatchObject({
      codeTtlMs: 600_000,
      codeMaxAttempts: 5,
      codeCooldownMs: 60_000,
      trustedProxyHops: 2
    });

    expect(() => getAuthSecurityConfig({ nodeEnv: "production" })).toThrow(
      "OTP_HASH_SECRET is required in production"
    );
    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "otp-production-secret-that-is-at-least-32-characters",
        securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters",
        codeTtlSeconds: "0"
      })
    ).toThrow("AUTH_CODE_TTL_SECONDS must be a positive safe integer");

    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "short",
        securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters"
      })
    ).toThrow("OTP_HASH_SECRET must be at least 32 bytes in production");
    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "same-production-secret-that-is-long-enough",
        securityIdentifierHashSecret: "same-production-secret-that-is-long-enough"
      })
    ).toThrow("Production auth hash secrets must be distinct");
    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "otp-production-secret-that-is-at-least-32-characters",
        securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters",
        codeMaxAttempts: "6"
      })
    ).toThrow("AUTH_CODE_MAX_ATTEMPTS must be 5 in production");
    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "development",
        codeTtlSeconds: String(Number.MAX_SAFE_INTEGER + 1)
      })
    ).toThrow("AUTH_CODE_TTL_SECONDS must be a positive safe integer");
  });

  it("measures production hash secrets in bytes and rejects development defaults", () => {
    expect(
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "🔐🔐🔐🔐🔐🔐🔐🔐",
        securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters"
      }).otpHashSecret
    ).toBe("🔐🔐🔐🔐🔐🔐🔐🔐");

    expect(() =>
      getAuthSecurityConfig({
        nodeEnv: "production",
        otpHashSecret: "otp-production-secret-that-is-at-least-32-characters",
        securityIdentifierHashSecret: "development-identifier-hash-secret"
      })
    ).toThrow("Production auth hash secrets must not use development defaults");
  });

  it("requires every exact production verification policy value", () => {
    const productionSecrets = {
      nodeEnv: "production",
      otpHashSecret: "otp-production-secret-that-is-at-least-32-characters",
      securityIdentifierHashSecret: "identifier-production-secret-at-least-32-characters"
    } as const;

    expect(() => getAuthSecurityConfig({ ...productionSecrets, codeTtlSeconds: "601" })).toThrow(
      "AUTH_CODE_TTL_SECONDS must be 600 in production"
    );
    expect(() => getAuthSecurityConfig({ ...productionSecrets, codeCooldownSeconds: "61" })).toThrow(
      "AUTH_CODE_COOLDOWN_SECONDS must be 60 in production"
    );
    expect(() => getAuthSecurityConfig({ ...productionSecrets, codeMaxAttempts: "9007199254740992" })).toThrow(
      "AUTH_CODE_MAX_ATTEMPTS must be a positive safe integer"
    );
  });
});

describe("email sender config", () => {
  it("uses console sender outside production", () => {
    expect(createEmailSender({ nodeEnv: "development", emailSender: "console" })).toBeInstanceOf(ConsoleEmailSender);
    expect(createEmailSender({ nodeEnv: "test" })).toBeInstanceOf(ConsoleEmailSender);
  });

  it("logs only a non-sensitive record reference in development", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await new ConsoleEmailSender().sendVerificationCode({
        email: "student@northeastern.edu",
        code: "123456",
        verificationCodeId: "code-1"
      });

      expect(logSpy.mock.calls).toEqual([["[dev email] verification-code/code-1 accepted"]]);
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain("student@northeastern.edu");
      expect(JSON.stringify(logSpy.mock.calls)).not.toContain("123456");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("rejects unsupported development and production sender modes during startup", () => {
    expect(() => createEmailSender({ nodeEnv: "development", emailSender: "external" })).toThrow(
      "Console email sender is required outside production"
    );
    expect(() => createEmailSender({ nodeEnv: "production", emailSender: "console" })).toThrow(
      "Production email sender must be resend"
    );
  });
});
