import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS = 10_000;
export const REMOTE_DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS = 20_000;

export function createDisposablePostgres(prefix: string) {
  const remote = process.env.RUN_REMOTE_DB_SMOKE === "1";
  const adminUrl = remote ? validatedRemoteAdminUrl() : undefined;
  const safePrefix = prefix.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const databaseName = remote
    ? `pswtest_${safePrefix.slice(0, 20)}_${randomUUID().replaceAll("-", "")}`
    : `${safePrefix}_${randomUUID().replaceAll("-", "")}`;
  const marker = `psw-disposable:${randomUUID()}`;
  const databaseUrl = adminUrl ? remoteTestDatabaseUrl(adminUrl, databaseName)
    : `postgresql://sublet:sublet@localhost:5432/${databaseName}?schema=public`;
  let creationAttempted = false;

  return {
    databaseName,
    databaseUrl,
    create() {
      if (adminUrl) {
        creationAttempted = true;
        remoteCommand("create", adminUrl, databaseName, marker);
        return;
      }
      dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE "${databaseName}"`]);
      const version = dockerPsql(["-d", databaseName, "-tAc", "SHOW server_version_num"]);
      if (!/^16/.test(version)) throw new Error(`PostgreSQL 16 is required; received ${version}`);
    },
    migrateDeploy() {
      if (adminUrl && !creationAttempted) throw new Error("The disposable database has not been created");
      const migrationEnvironment: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: databaseUrl };
      delete migrationEnvironment.REMOTE_DB_ADMIN_URL;
      const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
        cwd: join(__dirname, "../.."),
        encoding: "utf8",
        env: migrationEnvironment,
        timeout: remote ? REMOTE_DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS : DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS,
        maxBuffer: 1_048_576
      });
      if (result.status !== 0) {
        if (remote) throw new Error(`Disposable PostgreSQL migration failed (exit ${result.status ?? "unavailable"}); inspect redacted test logs`);
        throw new Error(`prisma migrate deploy failed: ${result.stderr || result.stdout}`);
      }
    },
    drop() {
      if (adminUrl) {
        if (creationAttempted) remoteCommand("drop", adminUrl, databaseName, marker);
        return;
      }
      dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`]);
    }
  };
}

function validatedRemoteAdminUrl() {
  const value = process.env.REMOTE_DB_ADMIN_URL;
  if (!value || process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0") throw new Error("Remote database smoke tests require an explicit verified-TLS administrator environment");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Invalid remote database test administrator configuration"); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hash || !url.username || !url.password ||
      !/^ep-[a-z0-9-]+\.(?:c-[0-9]{1,3}\.)?[a-z0-9-]+\.aws\.neon\.tech$/.test(url.hostname) ||
      url.hostname.includes("-pooler.") || url.searchParams.get("sslmode") !== "require" || url.searchParams.get("sslaccept") !== "strict") {
    throw new Error("Remote database smoke tests require a direct managed Neon administrator URL with verified TLS");
  }
  return value;
}

function remoteTestDatabaseUrl(adminUrl: string, databaseName: string) {
  const url = new URL(adminUrl);
  url.pathname = `/${databaseName}`;
  url.searchParams.set("schema", "public");
  return url.href;
}

function remoteCommand(action: "create" | "drop", adminUrl: string, databaseName: string, marker: string) {
  if (!/^pswtest_[a-z0-9_]{0,20}_[0-9a-f]{32}$/.test(databaseName) || !/^psw-disposable:[0-9a-f-]{36}$/.test(marker)) {
    throw new Error("Invalid disposable database ownership receipt");
  }
  const result = spawnSync(process.execPath, ["-e", remoteDatabaseCommand], {
    cwd: join(__dirname, "../.."), encoding: "utf8", maxBuffer: 16_384,
    timeout: REMOTE_DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS,
    env: { ...process.env, REMOTE_DB_ADMIN_URL: adminUrl, PSW_REMOTE_DB_ACTION: action, PSW_REMOTE_DB_NAME: databaseName, PSW_REMOTE_DB_MARKER: marker }
  });
  if (result.status !== 0) {
    // Driver and migration errors may echo credentials. No raw child output crosses this boundary.
    throw new Error(`Remote disposable PostgreSQL ${action} failed (exit ${result.status ?? "unavailable"})`);
  }
}

// The administrator URL is inherited through the child environment, never argv.
// A database ownership marker is checked server-side before every destructive operation.
const remoteDatabaseCommand = `
const { Client } = require("pg");
const { checkServerIdentity } = require("node:tls");
(async () => {
  const value = process.env.REMOTE_DB_ADMIN_URL;
  const databaseName = process.env.PSW_REMOTE_DB_NAME;
  const marker = process.env.PSW_REMOTE_DB_MARKER;
  const action = process.env.PSW_REMOTE_DB_ACTION;
  if (!/^pswtest_[a-z0-9_]{0,20}_[0-9a-f]{32}$/.test(databaseName || "") || !/^psw-disposable:[0-9a-f-]{36}$/.test(marker || "") || !["create", "drop"].includes(action)) throw new Error("Invalid disposable ownership receipt");
  const url = new URL(value);
  if (decodeURIComponent(url.pathname.slice(1)) === databaseName) throw new Error("Administrator database cannot be a drop target");
  const hostname = url.hostname;
  url.search = "";
  const client = new Client({ connectionString: url.href, connectionTimeoutMillis: 5000, query_timeout: 10000,
    ssl: { rejectUnauthorized: true, checkServerIdentity: (_host, cert) => checkServerIdentity(hostname, cert) } });
  try {
    await client.connect();
    if (action === "create") {
      const version = Number((await client.query("SHOW server_version_num")).rows[0].server_version_num);
      if (!((version >= 160000 && version < 170000) || (version >= 180000 && version < 190000))) throw new Error("Unsupported PostgreSQL version");
      await client.query('CREATE DATABASE "' + databaseName + '"');
      await client.query('COMMENT ON DATABASE "' + databaseName + '" IS ' + "'" + marker + "'");
      process.stdout.write(JSON.stringify({ created: true, serverVersion: version }));
    } else {
      const found = await client.query("SELECT shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname = $1", [databaseName]);
      if (!found.rowCount) { process.stdout.write(JSON.stringify({ dropped: false, absent: true })); return; }
      if (found.rows[0].marker !== marker) throw new Error("Disposable database ownership marker mismatch");
      await client.query('DROP DATABASE "' + databaseName + '" WITH (FORCE)');
      process.stdout.write(JSON.stringify({ dropped: true }));
    }
  } finally { await client.end().catch(() => undefined); }
})().catch(error => {
  const code = typeof error.code === "string" && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : "REMOTE_DATABASE_COMMAND_FAILED";
  process.stderr.write(JSON.stringify({ code })); process.exitCode = 1;
});
`;

function dockerPsql(args: string[]) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8", timeout: DISPOSABLE_POSTGRES_PROCESS_TIMEOUT_MS }
  );
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
