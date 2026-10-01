import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";
import { runPnpm, requireSuccess } from "./process-runner.mjs";

const apiDirectory = fileURLToPath(new URL("../api/", import.meta.url));
const databaseUrl = process.env.DATABASE_URL || "postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public";
const databaseIntegrationFiles = readdirSync(new URL("../api/test/", import.meta.url))
  .filter(name => name.endsWith(".integration.spec.ts") && !name.includes("valkey") && name !== "roommate-message-rate-limit.integration.spec.ts")
  .sort().map(name => `test/${name}`);
const tasks = {
  "launch:check": [
    { args: ["test"] },
    { args: ["typecheck"] },
    { args: ["build"] },
    { args: ["exec", "prisma", "validate"], env: { DATABASE_URL: databaseUrl } }
  ],
  "test:cli-build": [
    { args: ["build"] },
    { args: ["exec", "vitest", "run", "test/operations-cli-build.spec.ts"], env: { RUN_CLI_BUILD_SMOKE: "1" } }
  ],
  "launch:smoke": [{ args: ["exec", "vitest", "run", "test/launch-smoke.spec.ts"], env: { RUN_DB_SMOKE: "1" } }],
  "launch:smoke:marketplace": [{ args: ["exec", "vitest", "run", "test/marketplace-demo-journey.smoke.spec.ts"], env: { RUN_DB_SMOKE: "1", RUN_MARKETPLACE_SMOKE: "1" } }],
  "launch:smoke:database": [{ args: ["exec", "vitest", "run", ...databaseIntegrationFiles, "--maxWorkers=1", "--no-file-parallelism"], env: { RUN_DB_SMOKE: "1", RUN_MEDIA_SMOKE: "1" } }],
  "launch:smoke:roommate": [{ args: ["exec", "vitest", "run", "test/roommate-realtime-smoke.spec.ts", "test/roommate-messaging-migration-safety.spec.ts"], env: { RUN_DB_SMOKE: "1" } }],
  "launch:smoke:valkey": [{ args: ["exec", "vitest", "run", "test/valkey-rate-limit.integration.spec.ts", "test/roommate-message-rate-limit.integration.spec.ts", "test/roommate-valkey-realtime-smoke.spec.ts"], env: { RUN_DB_SMOKE: "1", RUN_VALKEY_SMOKE: "1" } }],
  "seed:marketplace": [{ args: ["exec", "ts-node", "-r", "tsconfig-paths/register", "src/seed-los-angeles.ts"], env: { DATABASE_URL: databaseUrl } }]
};

const name = process.argv[2];
if (!Object.hasOwn(tasks, name) || process.argv.length !== 3) {
  console.error("A supported API command is required.");
  process.exit(1);
}
const requiredEnvironment = name === "launch:smoke:valkey" ? ["VALKEY_URL", "DATABASE_URL"]
  : ["launch:smoke:roommate", "launch:smoke:database"].includes(name) ? ["DATABASE_URL"] : [];
for (const variable of requiredEnvironment) {
  if (!process.env[variable]?.trim()) {
    console.error(`${variable} is required for ${name}`);
    process.exit(1);
  }
}
for (const task of tasks[name]) {
  requireSuccess(runPnpm(task.args, { cwd: apiDirectory, env: { ...process.env, ...task.env } }));
}
