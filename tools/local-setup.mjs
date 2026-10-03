import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runPnpm, requireSuccess } from "./process-runner.mjs";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const databaseUrl = process.env.DATABASE_URL || "postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public";
const compose = (...args) => spawnSync("docker", ["compose", ...args], { cwd: rootDirectory, stdio: "inherit" });

// A local setup must not seed a production database inherited from a terminal.
let localDatabase;
try {
  localDatabase = new URL(databaseUrl);
} catch {
  console.error("Local setup requires a valid loopback PostgreSQL DATABASE_URL.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production" || !["postgresql:", "postgres:"].includes(localDatabase.protocol)
  || !["localhost", "127.0.0.1", "[::1]"].includes(localDatabase.hostname)) {
  console.error("Local setup only accepts a loopback PostgreSQL database outside production mode. Use the production deployment procedure for remote databases.");
  process.exit(1);
}

// Compose waits for each service's existing health check, with a bounded timeout.
requireSuccess(compose("up", "-d", "--build", "--wait", "--wait-timeout", "120", "db", "minio"), "Docker Compose must be installed and running; PostgreSQL and MinIO must become healthy.");
requireSuccess(compose("run", "--rm", "--build", "minio-init"), "Private media bucket initialization failed.");

const apiEnvironmentPath = fileURLToPath(new URL("../api/.env", import.meta.url));
if (!existsSync(apiEnvironmentPath)) {
  copyFileSync(fileURLToPath(new URL("../api/.env.example", import.meta.url)), apiEnvironmentPath);
}
const environment = { ...process.env, DATABASE_URL: databaseUrl };
requireSuccess(runPnpm(["--dir", "api", "prisma", "migrate", "deploy"], { cwd: rootDirectory, env: environment }));
requireSuccess(runPnpm(["--dir", "api", "seed:la"], { cwd: rootDirectory, env: environment }));
console.log("Local database is migrated and seeded.");
