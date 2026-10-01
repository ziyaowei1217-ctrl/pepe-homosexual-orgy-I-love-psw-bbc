import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("local setup database protection", () => {
  it.each([
    { DATABASE_URL: "postgresql://user:private-password@production.example.com/app" },
    { DATABASE_URL: "https://localhost/not-a-database" },
    { DATABASE_URL: "malformed-private-value" },
    { DATABASE_URL: "postgresql://localhost/app", NODE_ENV: "production" as const }
  ])("refuses unsafe local setup before starting Docker or seeding", (environment) => {
    const result = spawnSync(process.execPath, ["tools/local-setup.mjs"], {
      cwd: process.cwd(), encoding: "utf8", env: { ...process.env, ...environment }
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/Local setup (?:only accepts|requires)/);
    expect(result.stderr).not.toContain("private-password");
    expect(result.stderr).not.toContain("malformed-private-value");
    expect(result.stdout).toBe("");
  });
});
