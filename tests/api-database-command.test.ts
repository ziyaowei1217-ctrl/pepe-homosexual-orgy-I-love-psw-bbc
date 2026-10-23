import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const scriptPath = fileURLToPath(new URL("../tools/api-database-command.mjs", import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function readCommandEnvironment(databaseUrl: string | undefined) {
  const directory = mkdtempSync(join(tmpdir(), "api database command "));
  temporaryDirectories.push(directory);
  const fixture = join(directory, "inspect.ts");
  writeFileSync(fixture, "console.log(JSON.stringify({ url: process.env.DATABASE_URL, args: process.argv.slice(2) }));\n");
  const result = spawnSync(process.execPath, [
    scriptPath, "ts-node", "--transpile-only", "--skip-project", "--compiler-options",
    JSON.stringify({ module: "CommonJS", moduleResolution: "Node" }), fixture, "argument with spaces", "literal&value"
  ], { encoding: "utf8", env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 10_000 });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe("portable API database command", () => {
  it.each([undefined, ""])("uses the local default for an omitted or empty URL (%s)", (databaseUrl) => {
    expect(readCommandEnvironment(databaseUrl)).toEqual({
      url: "postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public",
      args: ["argument with spaces", "literal&value"]
    });
  });

  it("preserves an explicit URL and arguments without shell expansion", () => {
    const databaseUrl = "postgresql://test:literal%24%28value%29@localhost/custom?schema=private&connection_limit=2";
    expect(readCommandEnvironment(databaseUrl)).toEqual({ url: databaseUrl, args: ["argument with spaces", "literal&value"] });
  });

  it("rejects unsupported commands without exposing their contents", () => {
    const result = spawnSync(process.execPath, [scriptPath, "not-a-command-with-sensitive-content"], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stderr).toBe("Unsupported API database command.\n");
  });
});
