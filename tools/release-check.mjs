import { spawnSync } from "node:child_process";

const gates = [
  ["check"],
  ["-C", "api", "launch:check"],
  ["-C", "api", "launch:smoke:marketplace"]
];

for (const args of gates) {
  const result = spawnSync("pnpm", args, { stdio: "inherit" });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
