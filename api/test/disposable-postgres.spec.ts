import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({ spawnSyncMock: vi.fn() }));

vi.mock("node:child_process", () => ({ spawnSync: spawnSyncMock }));

import { createDisposablePostgres } from "./support/disposable-postgres";

describe("disposable PostgreSQL process bounds", () => {
  beforeEach(() => {
    vi.stubEnv("RUN_REMOTE_DB_SMOKE", "0");
    spawnSyncMock.mockReset();
    spawnSyncMock.mockReturnValue({ status: 0, stdout: "160014\n", stderr: "" });
  });

  afterEach(() => vi.unstubAllEnvs());

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


describe("explicit remote disposable PostgreSQL safety", () => {
  const administrator = "postgresql://test_operator:fixture-only-password@ep-fixture.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&sslaccept=strict&connect_timeout=2&pool_timeout=2&socket_timeout=3";
  beforeEach(() => {
    spawnSyncMock.mockReset(); spawnSyncMock.mockReturnValue({ status: 0, stdout: "{}", stderr: "" });
    vi.stubEnv("RUN_REMOTE_DB_SMOKE", "1"); vi.stubEnv("REMOTE_DB_ADMIN_URL", administrator);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("requires both operator opt-in and a direct verified-TLS administrator URL", () => {
    vi.stubEnv("REMOTE_DB_ADMIN_URL", "");
    expect(() => createDisposablePostgres("remote")).toThrow("explicit verified-TLS");
    vi.stubEnv("REMOTE_DB_ADMIN_URL", administrator.replace("ep-fixture.c-6.us-east-2.aws.neon.tech", "localhost"));
    expect(() => createDisposablePostgres("remote")).toThrow("direct managed Neon");
    vi.stubEnv("REMOTE_DB_ADMIN_URL", administrator.replace("sslaccept=strict", "sslaccept=accept_invalid_certs"));
    expect(() => createDisposablePostgres("remote")).toThrow("direct managed Neon");
    expect(spawnSyncMock).not.toHaveBeenCalled();
  });
  it("uses Docker when the cloud flag is absent even if an operator URL exists", () => {
    vi.stubEnv("RUN_REMOTE_DB_SMOKE", "0");
    const database = createDisposablePostgres("normal");
    expect(new URL(database.databaseUrl).hostname).toBe("localhost");
    database.drop(); expect(spawnSyncMock.mock.calls[0][0]).toBe("docker");
  });
  it("never passes credentials through argv and migrates only its UUID database", () => {
    const database = createDisposablePostgres("neon identity; DROP DATABASE neondb");
    expect(database.databaseName).toMatch(/^pswtest_[a-z0-9_]{0,20}_[0-9a-f]{32}$/);
    expect(database.databaseName.length).toBeLessThanOrEqual(63);
    expect(new URL(database.databaseUrl).pathname).toBe(`/${database.databaseName}`);
    expect(new URL(database.databaseUrl).searchParams.get("sslaccept")).toBe("strict");
    database.create(); database.migrateDeploy(); database.drop();
    expect(spawnSyncMock).toHaveBeenCalledTimes(3);
    for (const call of spawnSyncMock.mock.calls) {
      expect(JSON.stringify(call.slice(0, 2))).not.toContain("fixture-only-password");
      expect(JSON.stringify(call.slice(0, 2))).not.toContain(administrator);
      expect(call[2].timeout).toBe(20_000);
    }
    const migration = spawnSyncMock.mock.calls[1];
    expect(migration[2].env.REMOTE_DB_ADMIN_URL).toBeUndefined();
    expect(new URL(migration[2].env.DATABASE_URL).pathname).not.toBe("/neondb");
    const create = spawnSyncMock.mock.calls[0]; const drop = spawnSyncMock.mock.calls[2];
    expect(create[2].env.PSW_REMOTE_DB_NAME).toBe(database.databaseName);
    expect(drop[2].env.PSW_REMOTE_DB_NAME).toBe(database.databaseName);
    expect(create[2].env.PSW_REMOTE_DB_MARKER).toBe(drop[2].env.PSW_REMOTE_DB_MARKER);
    expect(drop[1][1]).toContain("ownership marker mismatch");
  });
  it("cannot drop without a create attempt, or change a target through mutable public properties", () => {
    const database = createDisposablePostgres("safety"); const generated = database.databaseName;
    database.drop(); expect(spawnSyncMock).not.toHaveBeenCalled();
    database.databaseName = "neondb"; database.databaseUrl = administrator;
    database.create(); database.drop();
    for (const call of spawnSyncMock.mock.calls) expect(call[2].env.PSW_REMOTE_DB_NAME).toBe(generated);
  });
  it("does not echo a credential-bearing child failure", () => {
    spawnSyncMock.mockReturnValue({ status: 1, stdout: administrator, stderr: "fixture-only-password" });
    const database = createDisposablePostgres("failure");
    expect(() => database.create()).toThrow("Remote disposable PostgreSQL create failed");
    try { database.create(); } catch (error) {
      expect(String(error)).not.toContain("fixture-only-password"); expect(String(error)).not.toContain(administrator);
    }
  });
});
