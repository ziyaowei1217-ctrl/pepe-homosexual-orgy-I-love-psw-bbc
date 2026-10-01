import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript utility is executed directly by Node.
import { mergeEnvironment, pnpmInvocation } from "../tools/process-runner.mjs";

describe("local backend scripts", () => {
  it("applies Windows environment overrides without duplicate names or a pnpm shell shim", () => {
    const entryPoint = "C:\\fixture\\pnpm.cjs";
    const environment = mergeEnvironment(
      { NPM_EXECPATH: "C:\\installed\\pnpm.cjs", Path: "installed-path" },
      { npm_execpath: entryPoint, PATH: "fixture-path" },
      "win32"
    );
    expect(Object.keys(environment).sort()).toEqual(["NPM_EXECPATH", "PATH"]);
    expect(environment.PATH).toBe("fixture-path");
    expect(pnpmInvocation(environment, "win32")).toEqual({ command: process.execPath, prefix: [entryPoint], shell: false });
  });

  it("starts both the root web app and API through the combined development command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const directory = mkdtempSync(join(tmpdir(), "sublet-dev-command-"));
    try {
      mkdirSync(join(directory, "api"));
      writeFileSync(join(directory, "pnpm-workspace.yaml"), "packages:\n  - '.'\n  - 'api'\n");
      writeFileSync(join(directory, "package.json"), JSON.stringify({
        name: "sublet-pipeline-web",
        private: true,
        scripts: { dev: "node -e \"console.log('WEB_STARTED')\"", "dev:local": packageJson.scripts["dev:local"] }
      }));
      writeFileSync(join(directory, "api/package.json"), JSON.stringify({
        name: "sublet-pipeline-api",
        private: true,
        scripts: { dev: "node -e \"console.log('API_STARTED')\"" }
      }));
      const environment = mergeEnvironment(process.env);
      const invocation = pnpmInvocation(environment);
      const result = spawnSync(invocation.command, [...invocation.prefix, "dev:local"], { cwd: directory, encoding: "utf8", timeout: 20_000, shell: invocation.shell, env: environment });
      expect(result.status, result.stderr).toBe(0);
      // pnpm uses workspace-relative prefixes on POSIX and absolute/truncated
      // directory prefixes on Windows; the distinct process markers are stable.
      expect(result.stdout).toMatch(/ dev: WEB_STARTED\r?$/m);
      expect(result.stdout).toMatch(/ dev: API_STARTED\r?$/m);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 25_000);
});
