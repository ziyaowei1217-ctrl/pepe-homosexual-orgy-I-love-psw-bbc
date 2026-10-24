import { createRequire } from "node:module";

// Run with the separate, direct operator connection. Never put its credentials
// in command arguments or deploy it as the application's DATABASE_URL.
const requireApi = createRequire(new URL("../api/package.json", import.meta.url));
const { Client, escapeIdentifier, escapeLiteral } = requireApi("pg");
const role = "psw_runtime";

async function provision() {
  const password = process.env.DATABASE_RUNTIME_PASSWORD;
  const raw = process.env.DATABASE_ADMIN_URL;
  if (!raw || !password || password.length < 32 || !/^[A-Za-z0-9_-]+$/.test(password)) {
    throw new Error("Provide DATABASE_ADMIN_URL and a random URL-safe DATABASE_RUNTIME_PASSWORD of at least32 characters through the operator environment.");
  }
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.username || !url.password || url.hash || url.hostname.includes("-pooler.")) {
    throw new Error("Use a direct PostgreSQL operator connection.");
  }
  // URL SSL flags must never override verified TLS on the operator connection.
  url.search = "";
  const client = new Client({ connectionString: url.href, ssl: { rejectUnauthorized: true }, enableChannelBinding: true, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const name = escapeIdentifier(role);
  try {
    await client.connect();
    if (!client.connection.stream.authorized) throw new Error("Verified TLS is required.");
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('psw:provision-runtime-role',0))");
    const existing = await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [role]);
    if (existing.rowCount) throw new Error("The runtime role already exists. This command never changes an existing password.");
    await client.query(`CREATE ROLE ${name} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ${escapeLiteral(password)}`);
    const current = await client.query("SELECT current_database() AS database");
    await client.query(`GRANT CONNECT ON DATABASE ${escapeIdentifier(current.rows[0].database)} TO ${name}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${name}`);
    const tables = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'");
    if (!tables.rowCount) throw new Error("Apply the committed application migrations before provisioning the runtime role.");
    for (const table of tables.rows) {
      const permissions = table.tablename === "AuditEvent" ? "SELECT, INSERT" : "SELECT, INSERT, UPDATE, DELETE";
      await client.query(`GRANT ${permissions} ON TABLE public.${escapeIdentifier(table.tablename)} TO ${name}`);
    }
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${name}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${name}`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${name}`);
    // The role receives no provider-auth schema, migration, DDL or role-management privileges.
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "created", role, applicationTables: tables.rowCount, verifiedTls: true }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    // Database errors can embed SQL literals. Print only an allowlisted code.
    const code = typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : "OPERATOR_SETUP_FAILED";
    console.error(JSON.stringify({ status: "failed", code, message: "Runtime role was not provisioned. Check the operator connection, migrations and role state; credential values are omitted." }));
    process.exitCode = 1;
  } finally { await client.end(); }
}

provision().catch(() => { console.error("Invalid operator setup. Credentials must be supplied through the environment; values omitted."); process.exitCode = 1; });
