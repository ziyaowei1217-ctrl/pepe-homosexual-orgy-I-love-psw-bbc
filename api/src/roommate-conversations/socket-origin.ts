import { getCorsOrigins } from "../config/cors";

/** A browser's Origin must be an exact configured origin, never a prefix or a URL with a path. */
export function isAllowedSocketOrigin(origin: unknown, environment: Record<string, string | undefined> = process.env) {
  if (origin === undefined) return environment.NODE_ENV !== "production";
  if (typeof origin !== "string" || origin.length > 2048) return false;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) return false;
    return getCorsOrigins(environment.WEB_ORIGIN).includes(origin);
  } catch { return false; }
}
