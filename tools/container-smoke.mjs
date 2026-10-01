import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { runPnpm } from "./process-runner.mjs";

// CI-only checks use disposable Compose services and development credentials.
// They never connect to external providers or a production database.
const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const suffix = randomUUID().slice(0, 8);
const apiName = `sublet-api-smoke-${suffix}`;
const webName = `sublet-web-smoke-${suffix}`;
const apiImage = `sublet-api-smoke:${suffix}`;
const webImage = `sublet-web-smoke:${suffix}`;
const databaseUrl = "postgresql://sublet:sublet@127.0.0.1:5432/sublet_pipeline?schema=public";

function docker(arguments_, allowFailure = false) {
  const result = spawnSync("docker", arguments_, { cwd: rootDirectory, stdio: "inherit" });
  if (!allowFailure && (result.error || result.status !== 0)) throw new Error("Container verification failed.");
}

async function waitFor(url) {
  const deadline = Date.now() + 60_000;
  do {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(3_000) })).ok) return;
    } catch { /* Not ready yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  } while (Date.now() < deadline);
  throw new Error("Container did not become healthy within 60 seconds.");
}

const hardening = ["--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--init", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m"];

try {
  docker(["build", "-f", "Dockerfile.api", "-t", apiImage, "."]);
  docker(["build", "-f", "Dockerfile.web", "--build-arg", "NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1", "--build-arg", "NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN=http://localhost:9000", "--build-arg", "NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE=", "--build-arg", "NEXT_PUBLIC_MAP_ATTRIBUTION=CI maps", "-t", webImage, "."]);
  docker(["run", "--rm", ...hardening, "--network=host", "-e", `DATABASE_URL=${databaseUrl}`, apiImage, "./api/node_modules/.bin/prisma", "migrate", "deploy", "--schema", "api/prisma/schema.prisma"]);
  docker(["run", "-d", "--name", apiName, ...hardening, "--network=host", "-e", "NODE_ENV=development", "-e", `DATABASE_URL=${databaseUrl}`, apiImage]);
  await waitFor("http://127.0.0.1:4000/api/v1/ready");
  docker(["run", "-d", "--name", webName, ...hardening, "--tmpfs", "/app/.next/cache:rw,noexec,nosuid,uid=1000,gid=1000,size=256m", "--network=host", "-e", "API_INTERNAL_BASE_URL=http://127.0.0.1:4000/api/v1", webImage]);
  await waitFor("http://127.0.0.1:3000/api/health");
  await waitFor("http://127.0.0.1:3000/");
  docker(["exec", webName, "node", "-e", "require('node:fs').writeFileSync('/app/.next/cache/write-check','ok')"]);
  const browserChecks = runPnpm(["test:browser", "http://127.0.0.1:3000"], { cwd: rootDirectory });
  if (browserChecks.error || browserChecks.status !== 0) throw new Error("Production browser verification failed.");
  console.log("Hardened container health, homepage and image-cache permissions passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Container verification failed.");
  process.exitCode = 1;
} finally {
  docker(["rm", "-f", webName, apiName], true);
  docker(["image", "rm", webImage, apiImage], true);
}
