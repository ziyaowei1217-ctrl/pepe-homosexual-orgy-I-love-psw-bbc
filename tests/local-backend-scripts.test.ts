import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
// @ts-expect-error JavaScript utility is executed directly by Node.
import { pnpmInvocation } from "../tools/process-runner.mjs";

describe("local backend scripts", () => {
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
      const invocation = pnpmInvocation();
      const result = spawnSync(invocation.command, [...invocation.prefix, "dev:local"], { cwd: directory, encoding: "utf8", timeout: 20_000, shell: invocation.shell });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/^\. dev: WEB_STARTED$/m);
      expect(result.stdout).toMatch(/^api dev: API_STARTED$/m);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 25_000);
});
