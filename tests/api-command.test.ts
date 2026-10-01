import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript utility is executed directly by Node.
import { mergeEnvironment } from "../tools/process-runner.mjs";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function runApiCommand(name: string, environment: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "sublet-api-command-"));
  temporaryDirectories.push(directory);
  const entryPoint = join(directory, "pnpm.cjs");
  const logPath = join(directory, "commands.jsonl");
  writeFileSync(entryPoint, `const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.COMMAND_TEST_LOG, JSON.stringify({ args, cwd: process.cwd(), database: process.env.DATABASE_URL, dbSmoke: process.env.RUN_DB_SMOKE, marketplaceSmoke: process.env.RUN_MARKETPLACE_SMOKE }) + "\\n");
if (args.join(" ") === process.env.COMMAND_TEST_FAIL) process.exit(17);
`);
  const result = spawnSync(process.execPath, ["tools/api-command.mjs", name], {
    cwd: process.cwd(), encoding: "utf8",
    env: mergeEnvironment(process.env, { npm_execpath: entryPoint, COMMAND_TEST_LOG: logPath, ...environment }),
    timeout: 10_000
  });
  return { ...result, commands: existsSync(logPath) ? readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [] };
}

describe("portable API command runner", () => {
  it("runs all API launch gates in the API directory and preserves the database URL", () => {
    const result = runApiCommand("launch:check", { DATABASE_URL: "postgresql://fixture-host/fixture" });
    expect(result.status).toBe(0);
    expect(result.commands.map((entry) => entry.args)).toEqual([["test"], ["typecheck"], ["build"], ["exec", "prisma", "validate"]]);
    expect(result.commands.every((entry) => entry.cwd === join(process.cwd(), "api"))).toBe(true);
    expect(result.commands.at(-1).database).toBe("postgresql://fixture-host/fixture");
  });

  it("stops the launch checks on failure before building", () => {
    const result = runApiCommand("launch:check", { COMMAND_TEST_FAIL: "typecheck" });
    expect(result.status).toBe(17);
    expect(result.commands.map((entry) => entry.args)).toEqual([["test"], ["typecheck"]]);
  });

  it("opts into the same marketplace integration suite without shell environment assignments", () => {
    const result = runApiCommand("launch:smoke:marketplace");
    expect(result.status).toBe(0);
    expect(result.commands[0]).toMatchObject({ args: ["exec", "vitest", "run", "test/marketplace-demo-journey.smoke.spec.ts"], dbSmoke: "1", marketplaceSmoke: "1" });
  });

  it("refuses missing distributed smoke infrastructure before launching tests", () => {
    const result = runApiCommand("launch:smoke:valkey", { VALKEY_URL: "", DATABASE_URL: "" });
    expect(result.status).toBe(1);
    expect(result.commands).toEqual([]);
    expect(result.stderr).toContain("VALKEY_URL is required");
  });
});
