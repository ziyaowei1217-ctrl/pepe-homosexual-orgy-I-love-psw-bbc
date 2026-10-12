import { afterEach, expect, it, vi } from "vitest";
import { createDisposablePostgres } from "./support/disposable-postgres";

afterEach(() => vi.unstubAllEnvs());

it("routes disposable clients to the explicitly selected isolated PostgreSQL server", () => {
  vi.stubEnv("TEST_DATABASE_URL", "postgresql://audit:p%40ss@127.0.0.1:15432/postgres?schema=public&sslmode=prefer");
  const database = createDisposablePostgres("target_probe");
  const url = new URL(database.databaseUrl);
  expect(url.host).toBe("127.0.0.1:15432");
  expect(url.username).toBe("audit");
  expect(url.password).toBe("p%40ss");
  expect(url.pathname).toBe(`/${database.databaseName}`);
  expect(url.searchParams.get("sslmode")).toBe("prefer");
});

it("rejects a malformed explicit test URL instead of falling back to the developer database", () => {
  vi.stubEnv("TEST_DATABASE_URL", "not-a-database");
  expect(() => createDisposablePostgres("target_probe")).toThrow();
});

it("fails closed when a gated run lacks an explicit disposable database target", () => {
  vi.stubEnv("RUN_DB_SMOKE", "1");
  vi.stubEnv("TEST_DATABASE_URL", "");
  vi.stubEnv("TEST_DATABASE_CONTAINER", "");
  expect(() => createDisposablePostgres("target_probe")).toThrow(/TEST_DATABASE/);
});
