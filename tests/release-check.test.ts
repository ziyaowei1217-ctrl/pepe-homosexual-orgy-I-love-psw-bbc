import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error JavaScript utility is executed directly by Node.
import { mergeEnvironment } from "../tools/process-runner.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function runReleaseCheck(failingCommand?: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "sublet-release-check-"));
  temporaryDirectories.push(directory);
  const logPath = path.join(directory, "commands.log");
  const pnpmPath = path.join(directory, "pnpm.cjs");
  writeFileSync(
    pnpmPath,
    [
      'const fs = require("node:fs");',
      'const args = process.argv.slice(2).join(" ");',
      'fs.appendFileSync(process.env.RELEASE_TEST_LOG, args + "\\n");',
      'if (args === process.env.RELEASE_TEST_FAIL_COMMAND) process.exit(17);'
    ].join("\n")
  );

  const result = spawnSync(process.execPath, ["tools/release-check.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: mergeEnvironment(process.env, {
      npm_execpath: pnpmPath,
      RELEASE_TEST_LOG: logPath,
      RELEASE_TEST_FAIL_COMMAND: failingCommand ?? ""
    }),
    timeout: 10_000
  });

  return {
    ...result,
    commands: existsSync(logPath)
      ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
      : []
  };
}

describe("release check", () => {
  it("runs the web, API, and external PostgreSQL/MinIO gates in order", () => {
    const result = runReleaseCheck();

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "check",
      "-C api launch:check",
      "-C api launch:smoke:marketplace"
    ]);
  });

  it("stops before the external smoke gate when an earlier gate fails", () => {
    const result = runReleaseCheck("-C api launch:check");

    expect(result.status).toBe(17);
    expect(result.commands).toEqual(["check", "-C api launch:check"]);
  });
});
