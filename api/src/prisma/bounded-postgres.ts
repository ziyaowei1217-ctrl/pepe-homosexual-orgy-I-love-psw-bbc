import { PrismaPg } from "@prisma/adapter-pg";
import { EventEmitter } from "node:events";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { Client, Pool, type ClientConfig, type PoolConfig } from "pg";

import { getDatabaseClientUrl } from "../config/env";

export const DATABASE_QUERY_TIMEOUT_MS = 3_000;
export const DATABASE_CONNECTION_TIMEOUT_MS = 2_000;

export function databasePoolConfig(environment: Record<string, string | undefined> = process.env): PoolConfig & { schema: string } {
  const value = getDatabaseClientUrl(environment);
  if (!value) throw new Error("DATABASE_URL is required");
  const url = new URL(value);
  const schema = url.searchParams.get("schema") ?? "public";
  const max = Number(url.searchParams.get("connection_limit") ?? "10");
  const expectedHost = url.hostname.replace(/^\[|\]$/g, "");
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(expectedHost);
  const mode = url.searchParams.get("sslmode");
  const composePlaintext = environment.NODE_ENV !== "production" && expectedHost === "db" && mode === "disable";
  if (mode === "disable" && !loopback && !composePlaintext) {
    throw new Error("DATABASE_URL plaintext is restricted to local development connections");
  }
  const verifiedTls = environment.NODE_ENV === "production" || mode === "require" || (!loopback && !composePlaintext);
  // No query setting is forwarded to pg: its URL parser can override explicit
  // SSL objects and several Prisma settings have different pg semantics.
  url.search = "";
  const identifier = `"${schema.replaceAll('"', '""')}"`;
  // PostgreSQL startup options split on unescaped whitespace/backslashes.
  const searchPath = identifier.replace(/[\\\s]/g, character => `\\${character}`);
  return {
    connectionString: url.href,
    ssl: verifiedTls ? {
      rejectUnauthorized: true,
      checkServerIdentity: (_host: string, certificate: PeerCertificate) => checkServerIdentity(expectedHost, certificate)
    } : false,
    Client: BoundedPostgresClient,
    max,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 10_000,
    options: `-c search_path=${searchPath}`,
    schema
  };
}

function boundClientQueries(client: Client) {
  const original = client.query.bind(client) as (...args: unknown[]) => unknown;
  client.query = ((...args: unknown[]) => {
    // Destroy the actual active transport through pg's public end(). The driver
    // settles its pending query and the pool removes the ended connection. A
    // caller-only race or pg query_timeout would leave wire work behind.
    const timer = setTimeout(() => { void client.end().catch(() => undefined); }, DATABASE_QUERY_TIMEOUT_MS);
    const callbackIndex = typeof args.at(-1) === "function" ? args.length - 1 : -1;
    if (callbackIndex >= 0) {
      const callback = args[callbackIndex] as (...values: unknown[]) => void;
      args[callbackIndex] = (...values: unknown[]) => { clearTimeout(timer); callback(...values); };
    }
    try {
      const result = original(...args);
      if (result instanceof Promise) return result.finally(() => clearTimeout(timer));
      if (result instanceof EventEmitter) {
        const finish = () => {
          clearTimeout(timer); result.removeListener("end", finish); result.removeListener("error", finish);
        };
        result.once("end", finish); result.once("error", finish);
      }
      return result;
    } catch (error) { clearTimeout(timer); throw error; }
  }) as typeof client.query;
}

class BoundedPostgresClient extends Client {
  constructor(config?: ClientConfig | string) {
    super(config);
    boundClientQueries(this);
  }
}

export function createBoundedPostgresAdapter(environment: Record<string, string | undefined> = process.env) {
  const { schema, ...config } = databasePoolConfig(environment);
  const pool = new Pool(config);
  const adapter = new PrismaPg(pool, { schema, disposeExternalPool: true });
  return { adapter, pool };
}
