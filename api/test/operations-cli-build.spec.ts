import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const runBuildSmoke = process.env.RUN_CLI_BUILD_SMOKE === "1";
const describeBuildSmoke = runBuildSmoke ? describe : describe.skip;
const apiDirectory = join(__dirname, "..");
const blocker = join(__dirname, "support/block-cli-development-dependencies.cjs");

describeBuildSmoke("compiled operations CLI entrypoints", () => {
  it.each([
    ["beta:invites", ["list"], "dist/src/operations/beta-invites.cli.js", "Invitation command failed"],
    [
      "admin:roles",
      [
        "grant",
        "--email",
        "reviewer@example.com",
        "--actor",
        "operator@example.com",
        "--reason",
        "Primary reviewer"
      ],
      "dist/src/operations/admin-roles.cli.js",
      "Administrator role command failed"
    ]
  ])("starts %s from its built artifact without CLI development dependencies", (script, argv, artifact, fallback) => {
    expect(existsSync(join(apiDirectory, artifact))).toBe(true);

    const result = spawnSync("pnpm", ["--silent", "run", script, ...argv], {
      cwd: apiDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://cli:cli@127.0.0.1:1/cli?connect_timeout=1",
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require=${JSON.stringify(blocker)}`.trim()
      }
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim()).toBe(`COMMAND_FAILED: ${fallback}`);
    expect(result.stderr).not.toContain("INVALID_ARGUMENTS:");
    expect(result.stderr).not.toMatch(/reviewer@example\.com|operator@example\.com|Primary reviewer/);
    expect(result.stderr).not.toContain("CLI_DEVELOPMENT_DEPENDENCY_LOADED");
  });
});
