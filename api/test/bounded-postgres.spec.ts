import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool, Query } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { databasePoolConfig } from "../src/prisma/bounded-postgres";
import { postgresQueryFixture } from "./helpers/protocol-fixtures";

const tls = {
  key: readFileSync(join(__dirname, "fixtures/postgres-tls/localhost.key")),
  cert: readFileSync(join(__dirname, "fixtures/postgres-tls/localhost.pem"))
};
const productionUrl = (host: string, port: number) => `postgresql://fixture:fixture@${host}:${port}/fixture?sslmode=require&sslaccept=strict&connect_timeout=2&pool_timeout=2&socket_timeout=3`;
afterEach(() => vi.unstubAllEnvs());

describe("bounded Postgres transport configuration", () => {
  it.each(["ssl=0", "ssl=no-verify", "sslcert=path", "sslrootcert=path", "sslkey=path", "sslnegotiation=direct", "uselibpqcompat=true", "options=-c%20statement_timeout=0", "query_timeout=0", "connection_limit=11", "connection_limit=1&connection_limit=2", "schema=", "schema=%00", "schema=%24user", "schema=pg_temp"])("rejects unsupported or ambiguous driver settings %s", setting => {
    expect(() => databasePoolConfig({ NODE_ENV: "production", DATABASE_URL: `${productionUrl("db.example.test", 5432)}&${setting}` })).toThrow("DATABASE_URL");
  });

  it("permits only the explicit development Compose plaintext exception", () => {
    expect(databasePoolConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://fixture:fixture@db:5432/fixture?schema=public&sslmode=disable" }).ssl).toBe(false);
    expect(databasePoolConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://fixture:fixture@localhost:5432/fixture" }).ssl).toBe(false);
    expect(databasePoolConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://fixture:fixture@db:5432/fixture" }).ssl).toMatchObject({ rejectUnauthorized: true });
    expect(() => databasePoolConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://fixture:fixture@remote.example.test:5432/fixture?sslmode=disable" })).toThrow("plaintext");
    expect(databasePoolConfig({ NODE_ENV: "production", DATABASE_URL: productionUrl("db", 5432) }).ssl).toMatchObject({ rejectUnauthorized: true });
    expect(() => databasePoolConfig({ NODE_ENV: "production", DATABASE_URL: productionUrl("db", 5432).replace("sslmode=require", "sslmode=disable") })).toThrow("DATABASE_URL");
    expect(databasePoolConfig({ NODE_ENV: "development", DATABASE_URL: productionUrl("localhost", 5432) }).ssl).toMatchObject({ rejectUnauthorized: true });
  });

  it("reconstructs a query-free URL and safely quoted custom search_path", () => {
    const schema = 'space\\slash"comma,tab\tname';
    const url = new URL(productionUrl("db.example.test", 5432)); url.searchParams.set("schema", schema); url.searchParams.set("connection_limit", "4");
    const config = databasePoolConfig({ NODE_ENV: "production", DATABASE_URL: url.href });
    expect(new URL(config.connectionString!).search).toBe("");
    expect(config).toMatchObject({ max: 4, connectionTimeoutMillis: 2_000, schema, ssl: { rejectUnauthorized: true } });
    expect(config.options).toBe('-c search_path="space\\\\slash""comma,tab\\\tname"');
  });

  it.each([
    { host: "localhost", valid: true },
    { host: "127.0.0.1", valid: false }
  ])("verifies a trusted test certificate against the actual URL host $host", async ({ host, valid }) => {
    const fixture = await postgresQueryFixture(tls); fixture.state.stall = false;
    const port = new URL(fixture.url).port;
    const { schema: _schema, ...config } = databasePoolConfig({ NODE_ENV: "production", DATABASE_URL: productionUrl(host, Number(port)) });
    // This CA is trusted only by the local test transport. Production uses its
    // platform trust store and cannot inject a CA through URL query settings.
    const pool = new Pool({ ...config, ssl: { ...(config.ssl as object), ca: tls.cert } });
    try {
      if (valid) await expect(pool.query("SELECT 1")).resolves.toMatchObject({ rows: [{ one: 1 }] });
      else await expect(pool.query("SELECT 1")).rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
    } finally { await pool.end(); await fixture.close(); }
  }, 5_000);

  it("clears deadlines for healthy pg Query emitter completion", async () => {
    const fixture = await postgresQueryFixture(); fixture.state.stall = false;
    const { schema: _schema, ...config } = databasePoolConfig({ NODE_ENV: "test", DATABASE_URL: fixture.url });
    const pool = new Pool(config); const client = await pool.connect();
    try {
      const query = new Query("SELECT 1");
      const completed = new Promise<void>((resolve, reject) => { query.once("end", () => resolve()); query.once("error", reject); });
      client.query(query); await completed;
      await new Promise(resolve => setTimeout(resolve, 3_100));
      expect(fixture.state.closedConnections).toBe(0);
      await expect(client.query("SELECT 1")).resolves.toMatchObject({ rows: [{ one: 1 }] });
      expect(fixture.state.connections).toBe(1);
    } finally { client.release(); await pool.end(); await fixture.close(); }
  }, 6_000);

});
