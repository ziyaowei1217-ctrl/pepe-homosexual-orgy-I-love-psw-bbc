// Explicit test-only routing prevents a release check from touching the developer's database.
export function testDatabaseUrl(databaseName: string) {
  const url = target();
  if (!/^[a-z0-9_]+$/i.test(databaseName)) throw new Error("Unsafe disposable database name");
  url.pathname = `/${databaseName}`;
  return url.href;
}

export function testDatabaseContainer() {
  const name = process.env.TEST_DATABASE_CONTAINER ?? "sublet-pipeline-db";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(name)) throw new Error("Invalid TEST_DATABASE_CONTAINER");
  return name;
}

export function testDatabaseUser() {
  return decodeURIComponent(target().username);
}

function target() {
  if (process.env.RUN_DB_SMOKE === "1" && (!process.env.TEST_DATABASE_URL?.trim() || !process.env.TEST_DATABASE_CONTAINER?.trim())) {
    throw new Error("Gated database tests require TEST_DATABASE_URL and TEST_DATABASE_CONTAINER");
  }
  const url = new URL(process.env.TEST_DATABASE_URL ?? "postgresql://sublet:sublet@localhost:5432/postgres?schema=public");
  if (!["postgresql:", "postgres:"].includes(url.protocol) || !url.hostname || !url.username) {
    throw new Error("TEST_DATABASE_URL must identify a PostgreSQL test server and user");
  }
  return url;
}
