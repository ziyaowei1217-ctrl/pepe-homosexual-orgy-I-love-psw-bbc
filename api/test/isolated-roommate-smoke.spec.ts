import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));

import {
  ISOLATED_ROOMMATE_SMOKE_TIMEOUT_MS,
  runIsolatedRoommateRealtimeSmoke
} from "./support/isolated-roommate-smoke";

describe("isolated roommate smoke process", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "", stderr: "" });
  });

  it("uses a native deadline and SIGKILL boundary for Nest, Socket.IO, and Prisma handles", () => {
    runIsolatedRoommateRealtimeSmoke("postgresql://test/database");

    expect(spawnSyncMock).toHaveBeenCalledOnce();
    expect(spawnSyncMock.mock.calls[0]?.[0]).toBe(process.execPath);
    expect(spawnSyncMock.mock.calls[0]?.[1]).toEqual([
      expect.stringMatching(/vitest[\\/]vitest\.mjs$/),
      "run",
      "test/roommate-realtime-smoke.spec.ts",
      "--pool=threads",
      "--poolOptions.threads.singleThread"
    ]);
    expect(spawnSyncMock.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({
        timeout: ISOLATED_ROOMMATE_SMOKE_TIMEOUT_MS,
        killSignal: "SIGKILL",
        env: expect.objectContaining({
          DATABASE_URL: "postgresql://test/database",
          RUN_DB_SMOKE: "1",
          RUN_ROOMMATE_REALTIME_CHILD: "1"
        })
      })
    );
  });
});
