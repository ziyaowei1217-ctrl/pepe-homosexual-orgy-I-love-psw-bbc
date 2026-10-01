import { spawnSync } from "node:child_process";

// pnpm's JavaScript entry point avoids invoking a .cmd shim on Windows.
export function pnpmInvocation(environment = process.env, platform = process.platform) {
  const entryPoint = environment.npm_execpath;
  if (entryPoint && /(?:^|[/\\])pnpm\.[cm]?js$/i.test(entryPoint)) {
    return { command: process.execPath, prefix: [entryPoint], shell: false };
  }
  return { command: platform === "win32" ? "pnpm.cmd" : "pnpm", prefix: [], shell: platform === "win32" };
}

export function runPnpm(arguments_, options = {}) {
  const invocation = pnpmInvocation(options.env ?? process.env);
  // Callers supply fixed, repository-owned arguments; secrets are passed only in env.
  return spawnSync(invocation.command, [...invocation.prefix, ...arguments_], {
    stdio: "inherit",
    ...options,
    shell: invocation.shell
  });
}

export function requireSuccess(result, message = "Command failed.") {
  if (result.error) {
    console.error(message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
