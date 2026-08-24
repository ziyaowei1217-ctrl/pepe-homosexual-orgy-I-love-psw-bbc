import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  const pnpmPath = path.join(directory, "pnpm");
  writeFileSync(
    pnpmPath,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$*" >> "$RELEASE_TEST_LOG"',
      'if [ "$*" = "$RELEASE_TEST_FAIL_COMMAND" ]; then exit 17; fi'
    ].join("\n")
  );
  chmodSync(pnpmPath, 0o755);

  const result = spawnSync(process.execPath, ["tools/release-check.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH ?? ""}`,
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
