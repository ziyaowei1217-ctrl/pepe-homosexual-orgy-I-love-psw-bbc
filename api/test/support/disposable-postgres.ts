import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function createDisposablePostgres(prefix: string) {
  const safePrefix = prefix.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
  const databaseName = `${safePrefix}_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = `postgresql://sublet:sublet@localhost:5432/${databaseName}?schema=public`;

  return {
    databaseName,
    databaseUrl,
    create() {
      dockerPsql(["-d", "postgres", "-c", `CREATE DATABASE "${databaseName}"`]);
      const version = dockerPsql(["-d", databaseName, "-tAc", "SHOW server_version_num"]);
      if (!/^16/.test(version)) throw new Error(`PostgreSQL 16 is required; received ${version}`);
    },
    migrateDeploy() {
      const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"], {
        cwd: join(__dirname, "../.."),
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: databaseUrl }
      });
      if (result.status !== 0) {
        throw new Error(`prisma migrate deploy failed: ${result.stderr || result.stdout}`);
      }
    },
    drop() {
      dockerPsql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`]);
    }
  };
}

function dockerPsql(args: string[]) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8" }
  );
  if (result.status !== 0) throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}
