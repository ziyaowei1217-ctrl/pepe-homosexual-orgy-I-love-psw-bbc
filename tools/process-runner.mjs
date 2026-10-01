import { spawnSync } from "node:child_process";

// Windows environment names are case-insensitive. Node sorts duplicate names
// before spawning, so canonicalize them before applying an override.
export function mergeEnvironment(environment = process.env, overrides = {}, platform = process.platform) {
  const merged = {};
  for (const source of [environment, overrides]) {
    for (const [name, value] of Object.entries(source)) {
      merged[platform === "win32" ? name.toUpperCase() : name] = value;
    }
  }
  return merged;
}

// pnpm's JavaScript entry point avoids invoking a .cmd shim on Windows.
export function pnpmInvocation(environment = process.env, platform = process.platform) {
  const normalized = mergeEnvironment(environment, {}, platform);
  const entryPoint = normalized[platform === "win32" ? "NPM_EXECPATH" : "npm_execpath"];
  if (entryPoint && /(?:^|[/\\])pnpm\.[cm]?js$/i.test(entryPoint)) {
    return { command: process.execPath, prefix: [entryPoint], shell: false };
  }
  return { command: platform === "win32" ? "pnpm.cmd" : "pnpm", prefix: [], shell: platform === "win32" };
}

export function runPnpm(arguments_, options = {}) {
  const environment = mergeEnvironment(options.env ?? process.env);
  const invocation = pnpmInvocation(environment);
  // Callers supply fixed, repository-owned arguments; secrets are passed only in env.
  return spawnSync(invocation.command, [...invocation.prefix, ...arguments_], {
    stdio: "inherit",
    ...options,
    env: environment,
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
