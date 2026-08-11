import { beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));

import { createDisposablePostgres } from "./support/disposable-postgres";

describe("disposable PostgreSQL process bounds", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "160014\n", stderr: "" });
  });

  it("sets an explicit timeout on create, version, migration, and drop child processes", () => {
    const database = createDisposablePostgres("bounded_processes");

    database.create();
    database.migrateDeploy();
    database.drop();

    expect(spawnSyncMock).toHaveBeenCalledTimes(4);
    for (const call of spawnSyncMock.mock.calls) {
      expect(call[2]).toEqual(expect.objectContaining({ timeout: 10_000 }));
    }
  });
});
