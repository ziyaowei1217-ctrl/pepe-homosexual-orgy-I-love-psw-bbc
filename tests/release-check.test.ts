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

function runReleaseCheck(failingCommand?: string, includeInfrastructure = true) {
  const directory = mkdtempSync(path.join(tmpdir(), "sublet-release-check-"));
  temporaryDirectories.push(directory);
  const logPath = path.join(directory, "commands.log");
  const environmentLogPath = path.join(directory, "environments.log");
  const pnpmPath = path.join(directory, "pnpm");
  writeFileSync(
    pnpmPath,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$*" >> "$RELEASE_TEST_LOG"',
      'printf "%s|%s|%s|%s\\n" "$*" "$DATABASE_URL" "$NEXT_PUBLIC_API_BASE_URL" "$API_INTERNAL_BASE_URL" >> "$RELEASE_TEST_ENV_LOG"',
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
      RELEASE_TEST_ENV_LOG: environmentLogPath,
      NEXT_PUBLIC_API_BASE_URL: "https://fixture.example/api/v1",
      API_INTERNAL_BASE_URL: "http://localhost:4008/api/v1",
      RELEASE_TEST_FAIL_COMMAND: failingCommand ?? "",
      DATABASE_URL: includeInfrastructure ? "postgresql://audit:audit@localhost:15432/release_test" : "",
      TEST_DATABASE_URL: includeInfrastructure ? "postgresql://audit:audit@localhost:15432/postgres" : "",
      TEST_DATABASE_CONTAINER: includeInfrastructure ? "release-test-postgres" : "",
      VALKEY_URL: includeInfrastructure ? "redis://localhost:16379" : "",
      LISTING_MEDIA_STORAGE_ENDPOINT: includeInfrastructure ? "http://localhost:19000" : "",
      LISTING_MEDIA_UPLOAD_ENDPOINT: includeInfrastructure ? "http://localhost:19000" : "",
      LISTING_MEDIA_STORAGE_REGION: includeInfrastructure ? "us-east-1" : "",
      LISTING_MEDIA_STORAGE_BUCKET: includeInfrastructure ? "release-test-media" : "",
      LISTING_MEDIA_STORAGE_ACCESS_KEY_ID: includeInfrastructure ? "release-test" : "",
      LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY: includeInfrastructure ? "release-test-secret" : ""
    }
  });

  return {
    ...result,
    environments: existsSync(environmentLogPath) ? readFileSync(environmentLogPath, "utf8").trim().split("\n") : [],
    commands: existsSync(logPath)
      ? readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean)
      : []
  };
}

describe("release check", () => {
  it("runs default checks and the complete infrastructure release gate in order", () => {
    const result = runReleaseCheck();

    expect(result.status).toBe(0);
    expect(result.commands).toEqual([
      "check",
      "-C api launch:check",
      "exec node tools/infrastructure-check.mjs"
    ]);
  });

  it("isolates configuration-default tests while preserving live infrastructure configuration", () => {
    const result = runReleaseCheck();
    expect(result.status).toBe(0);
    expect(result.environments).toEqual([
      "check|||",
      "-C api launch:check|||",
      "exec node tools/infrastructure-check.mjs|postgresql://audit:audit@localhost:15432/release_test|https://fixture.example/api/v1|http://localhost:4008/api/v1"
    ]);
  });

  it("fails before reporting a green release when infrastructure is not configured", () => {
    const result = runReleaseCheck(undefined, false);
    expect(result.status).not.toBe(0);
    expect(result.commands).toEqual([]);
    expect(result.stderr).toContain("TEST_DATABASE_URL");
  });

  it("propagates the complete infrastructure gate failure", () => {
    const result = runReleaseCheck("exec node tools/infrastructure-check.mjs");
    expect(result.status).toBe(17);
  });

  it("stops before the external smoke gate when an earlier gate fails", () => {
    const result = runReleaseCheck("-C api launch:check");

    expect(result.status).toBe(17);
    expect(result.commands).toEqual(["check", "-C api launch:check"]);
  });
});
