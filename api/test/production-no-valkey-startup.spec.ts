import { describe, expect, it } from "vitest";

import { assertProductionRuntimeConfig } from "../src/config/env";

describe("production startup without Valkey", () => {
  it("fails closed before the application starts", () => {
    expect(() => assertProductionRuntimeConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://db.example.com/app?sslmode=require",
      WEB_ORIGIN: "https://app.example.com",
      VALKEY_URL: ""
    })).toThrow("VALKEY_URL is required in production");
  });
});
