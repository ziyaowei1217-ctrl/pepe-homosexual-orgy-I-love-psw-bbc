import { spawnSync } from "node:child_process";

const gates = [
  ["check"],
  ["-C", "api", "launch:check"],
  ["-C", "api", "launch:smoke:marketplace"]
];

const pnpmCli = process.env.npm_execpath;
const useNode = Boolean(pnpmCli && /(?:^|[\\/])pnpm\.(?:c?js)$/i.test(pnpmCli));

for (const args of gates) {
  const result = spawnSync(useNode ? process.execPath : "pnpm", useNode ? [pnpmCli, ...args] : args, {
    stdio: "inherit",
    // Direct invocation outside pnpm needs Windows' command shim. Every gate
    // argument above is fixed; no caller-supplied text is evaluated by a shell.
    shell: !useNode && process.platform === "win32"
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
