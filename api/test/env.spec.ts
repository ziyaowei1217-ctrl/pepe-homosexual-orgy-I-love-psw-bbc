import { describe, expect, it } from "vitest";

import { getJwtSecret } from "../src/config/env";

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
