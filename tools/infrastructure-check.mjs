import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { requireTestInfrastructure } from "./infrastructure-env.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
function specificationFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? specificationFiles(join(directory, entry.name), relative) :
      entry.isFile() && entry.name.endsWith(".spec.ts") ? [relative] : [];
  });
}

const flags = {
  RUN_DB_SMOKE: "1", RUN_MEDIA_SMOKE: "1", RUN_MARKETPLACE_SMOKE: "1",
  RUN_VALKEY_SMOKE: "1", RUN_CLI_BUILD_SMOKE: "1"
};

try {
  requireTestInfrastructure();
  // Discover gated files so new infrastructure tests cannot silently miss the release command.
  const files = specificationFiles(join(root, "api/test"))
    .filter((name) => /process\.env\.RUN_(DB|MEDIA|MARKETPLACE|VALKEY|CLI_BUILD)_SMOKE/.test(
      readFileSync(join(root, "api/test", name), "utf8")
    )).sort();
  if (!files.length) throw new Error("No infrastructure test files were discovered");
  const temporary = mkdtempSync(join(tmpdir(), "sublet-infrastructure-gates-"));
  try {
    const report = resolve(temporary, "results.json");
    const result = spawnSync("pnpm", ["-C", "api", "exec", "vitest", "run",
      ...files.map((name) => `test/${name}`), "--pool=threads", "--poolOptions.threads.singleThread",
      "--reporter=default", "--reporter=json", `--outputFile=${report}`
    ], { cwd: root, stdio: "inherit", env: { ...process.env, ...flags } });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    else {
      const summary = JSON.parse(readFileSync(report, "utf8"));
      if (!summary.success || !summary.numTotalTests || summary.numPendingTests || summary.numFailedTests) {
        throw new Error("Infrastructure gate must run every selected test without failures or skips");
      }
      console.log(`Infrastructure gate: ${summary.numPassedTests} passed, zero skipped (${files.length} files).`);
    }
  } finally { rmSync(temporary, { recursive: true, force: true }); }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
