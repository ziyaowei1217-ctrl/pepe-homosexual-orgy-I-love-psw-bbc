import { describe, expect, it } from "vitest";

import { getJwtSecret } from "../src/config/env";
import { ConsoleEmailSender, createEmailSender, MissingProductionEmailSender } from "../src/email/email-sender";

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
});

describe("email sender config", () => {
  it("uses console sender outside production", () => {
    expect(createEmailSender({ nodeEnv: "development", emailSender: "console" })).toBeInstanceOf(ConsoleEmailSender);
    expect(createEmailSender({ nodeEnv: "test" })).toBeInstanceOf(ConsoleEmailSender);
  });

  it("fails fast for production sender created by the default factory", async () => {
    const sender = createEmailSender({ nodeEnv: "production", emailSender: "console" });
    const externalSender = createEmailSender({ nodeEnv: "production", emailSender: "external" });

    expect(sender).toBeInstanceOf(MissingProductionEmailSender);
    expect(externalSender).toBeInstanceOf(MissingProductionEmailSender);
    await expect(
      sender.sendVerificationCode({
        email: "student@northeastern.edu",
        code: "123456"
      })
    ).rejects.toThrow("Production email sender is not configured");
  });
});
