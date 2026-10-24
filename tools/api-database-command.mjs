import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(new URL("../api/package.json", import.meta.url));
const entrypoints = {
  prisma: "prisma/build/index.js",
  "ts-node": "ts-node/dist/bin.js"
};
const [command, ...args] = process.argv.slice(2);
if (!Object.hasOwn(entrypoints, command)) {
  console.error("Unsupported API database command.");
  process.exit(1);
}

// Keep the local fallback in JavaScript: pnpm's portable shell does not support
// POSIX default-value parameter expansion, and Windows cannot execute bin shims.
const result = spawnSync(process.execPath, [require.resolve(entrypoints[command]), ...args], {
  stdio: "inherit",
  env: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public"
  }
});
if (result.error) {
  console.error("Unable to start the API database command.");
  process.exit(1);
}
process.exit(result.status ?? 1);
