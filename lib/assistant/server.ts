import Anthropic from "@anthropic-ai/sdk";

import { apiBaseUrl } from "../api";

// Server-side plumbing for the /api/assistant route handlers. Never import from client components.

export const assistantModel = "claude-opus-5-5";
/** Retries a request the model declines for policy reasons on Anthropic's recommended fallback model. */
export const fallbackBeta = "server-side-fallback-2026-07-01";

export function assistantEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let sharedClient: Anthropic | undefined;

function assistantClient() {
  if (!assistantEnabled()) return null;
  sharedClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY?.trim(), maxRetries: 1, timeout: 120_000 });
  return sharedClient;
}

export function jsonError(status: number, code: string, headers: Record<string, string> = {}) {
  return Response.json({ code }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export type QuotaKind = "chat" | "listing-copy";

export type AssistantGateDeps = {
  client: () => Anthropic | null;
  /** Checks the session and counts the request; resolves to the user id or the error response to send. */
  claimQuota: (token: string, kind: QuotaKind) => Promise<string | Response>;
};

export const defaultGateDeps: AssistantGateDeps = { client: assistantClient, claimQuota };

/** Every assistant call: configured, signed in, within the shared rate limit. */
export async function openAssistantRequest(request: Request, deps: AssistantGateDeps, kind: QuotaKind) {
  const client = deps.client();
  if (!client) return jsonError(503, "ASSISTANT_UNAVAILABLE");
  const token = /^Bearer ([\w.~+/=-]{1,4096})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return jsonError(401, "ASSISTANT_SIGN_IN_REQUIRED");
  const userId = await deps.claimQuota(token, kind);
  return typeof userId === "string" ? { client, userId } : userId;
}

/** The API's POST /assistant/quota/:kind (api/src/assistant) checks the token and the per-user and global limits. */
async function claimQuota(token: string, kind: QuotaKind): Promise<string | Response> {
  try {
    const response = await fetch(`${apiBaseUrl()}/assistant/quota/${kind}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000)
    });
    if (response.ok) {
      const { userId } = (await response.json()) as { userId?: unknown };
      if (typeof userId === "string") return userId;
    } else if (response.status === 401) {
      return jsonError(401, "ASSISTANT_SIGN_IN_REQUIRED");
    } else if (response.status === 429) {
      return jsonError(429, "ASSISTANT_RATE_LIMITED", { "Retry-After": response.headers.get("retry-after") ?? "60" });
    }
  } catch {
    // An API that is down or slow must not look like an expired session.
  }
  return jsonError(503, "ASSISTANT_UNAVAILABLE");
}

/** Reads a JSON body of at most `maxBytes`; undefined when it is larger or not JSON. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes || !request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value when it is a string of at most `maxChars`, trimmed; "" when absent; undefined otherwise. */
export function textField(value: unknown, maxChars: number) {
  if (value === undefined) return "";
  return typeof value === "string" && value.length <= maxChars ? value.trim() : undefined;
}

export function logAssistantError(label: string, error: unknown) {
  // Status and error type only: prompts and listing text never go to the logs.
  console.error(label, error instanceof Anthropic.APIError ? `${error.status} ${error.name}` : error instanceof Error ? error.name : "unknown");
}
