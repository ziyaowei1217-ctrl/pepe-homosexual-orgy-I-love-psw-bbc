import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const ISOLATED_ROOMMATE_SMOKE_TIMEOUT_MS = 15_000;

export function runIsolatedRoommateRealtimeSmoke(databaseUrl: string): void {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("vitest/vitest.mjs"),
      "run",
      "test/roommate-realtime-smoke.spec.ts",
      "--pool=threads",
      "--poolOptions.threads.singleThread"
    ],
    {
      cwd: join(__dirname, "../.."),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        RUN_DB_SMOKE: "1",
        RUN_ROOMMATE_REALTIME_CHILD: "1"
      },
      timeout: ISOLATED_ROOMMATE_SMOKE_TIMEOUT_MS,
      killSignal: "SIGKILL"
    }
  );
  if (result.status !== 0) {
    throw new Error(`isolated roommate smoke failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
}
