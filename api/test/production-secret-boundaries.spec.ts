import { productionEnvironment } from "./support/production-environment";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertProductionRuntimeConfig, getAuthSecurityConfig, getJwtSecret } from "../src/config/env";

const valid = {
  ...productionEnvironment(),
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://db.example.test/app?sslmode=require",
  WEB_ORIGIN: "https://app.example.test",
  VALKEY_URL: "rediss://cache.example.test:6379",
  JWT_SECRET: "jwt-test-fixture-with-at-least-32-bytes",
  OTP_HASH_SECRET: "otp-test-fixture-with-at-least-32-bytes",
  SECURITY_IDENTIFIER_HASH_SECRET: "identifier-test-fixture-with-at-least-32-bytes",
  MFA_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="
};

afterEach(() => vi.unstubAllEnvs());

describe("production secret boundaries", () => {
  it.each(["x", " ".repeat(40), "docker-development-jwt-secret-change-me", "development-identifier-hash-secret"])(
    "rejects weak and public development signing keys before token issuance (%s)", (jwtSecret) => {
      expect(() => getJwtSecret({ nodeEnv: "production", jwtSecret })).toThrow();
    }
  );

  it.each(["JWT_SECRET", "OTP_HASH_SECRET", "SECURITY_IDENTIFIER_HASH_SECRET"])(
    "enforces %s at actual runtime startup without invoking the deployment CLI", (name) => {
      expect(() => assertProductionRuntimeConfig({ ...valid, [name]: "x" })).toThrow(name);
    }
  );

  it.each(["OTP_HASH_SECRET", "SECURITY_IDENTIFIER_HASH_SECRET"])(
    "rejects signing key reuse as %s at startup", (name) => {
      expect(() => assertProductionRuntimeConfig({ ...valid, [name]: valid.JWT_SECRET })).toThrow(/distinct/);
    }
  );

  it("rejects JWT reuse even when the auth hash configuration is resolved separately", () => {
    vi.stubEnv("JWT_SECRET", valid.JWT_SECRET);
    expect(() => getAuthSecurityConfig({
      nodeEnv: "production", otpHashSecret: valid.JWT_SECRET,
      securityIdentifierHashSecret: valid.SECURITY_IDENTIFIER_HASH_SECRET
    })).toThrow(/distinct/);
  });

  it("accepts three independent signing and hashing keys", () => {
    expect(() => assertProductionRuntimeConfig(valid)).not.toThrow();
    expect(getJwtSecret({ nodeEnv: "production", jwtSecret: valid.JWT_SECRET })).toBe(valid.JWT_SECRET);
  });
});
