import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

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
      'const command = process.argv.slice(2).join(" ");',
      'fs.appendFileSync(process.env.RELEASE_TEST_LOG, command + "\\n");',
      'if (command === process.env.RELEASE_TEST_FAIL_COMMAND) process.exit(17);'
    ].join("\n")
  );

  // Windows folds environment names and keeps the first case variant, so an
  // inherited NPM_EXECPATH must not override this fixture's fake pnpm CLI.
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === "npm_execpath") delete environment[key];
  }
  const result = spawnSync(process.execPath, [path.resolve("tools/release-check.mjs")], {
    // An unexpected real-pnpm fallback must fail in this empty fixture rather
    // than recursively launch the repository's complete release checks.
    cwd: directory,
    encoding: "utf8",
    timeout: 10_000,
    killSignal: "SIGKILL",
    env: {
      ...environment,
      npm_execpath: pnpmPath,
      RELEASE_TEST_LOG: logPath,
      RELEASE_TEST_FAIL_COMMAND: failingCommand ?? ""
    }
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

    expect(result.status, result.error?.message || result.stderr).toBe(0);
    expect(result.commands).toEqual([
      "check",
      "-C api launch:check",
      "-C api launch:smoke:marketplace"
    ]);
  });

  it("stops before the external smoke gate when an earlier gate fails", () => {
    const result = runReleaseCheck("-C api launch:check");

    expect(result.status, result.error?.message || result.stderr).toBe(17);
    expect(result.commands).toEqual(["check", "-C api launch:check"]);
  });
});
