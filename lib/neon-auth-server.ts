// Use Neon's documented, framework-independent Fetch toolkit. Its bundled
// /next adapter targets Next 16; this application deliberately stays on Next 15.
// Configuration is read per request so the default email build needs no Neon secrets.
type Environment = Record<string, string | undefined>;

export function neonServerConfiguration(environment: Environment = process.env) {
  if (environment.NEXT_PUBLIC_AUTH_PROVIDER !== "neon") return null;
  const raw = environment.NEON_AUTH_BASE_URL;
  const secret = environment.NEON_AUTH_COOKIE_SECRET;
  if (!raw || raw.length > 2048 || !secret || secret.length < 32 ||
      /^(?:replace[-_ ]?me|change[-_ ]?me|your[-_ ].*|todo|example)$/i.test(secret.trim())) return null;
  try {
    const url = new URL(raw);
    const app = new URL(environment.NEON_AUTH_APP_ORIGIN ?? "");
    if (app.protocol !== "https:" || app.port || app.username || app.password || app.search || app.hash || app.pathname !== "/" ||
        !app.hostname.includes(".") || /(?:^|\.)(?:localhost|local|internal|invalid|test|example|example\.com|example\.org|example\.net)$/.test(app.hostname) ||
        /^[\d.]+$/.test(app.hostname) || app.hostname.includes(":")) return null;
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash ||
        !/^ep-[a-z0-9-]+\.neonauth\.(?:c-[0-9]{1,3}\.)?[a-z0-9-]+\.aws\.neon\.tech$/.test(url.hostname) ||
        !/^\/[a-zA-Z0-9_-]+\/auth\/?$/.test(url.pathname)) return null;
    const origins = [app.origin];
    // Netlify supplies this immutable URL at build/runtime. Accept only this
    // site's exact deploy URL, never an arbitrary Host/X-Forwarded-Host header
    // or every application under the shared netlify.app parent domain.
    if (environment.NETLIFY === "true" && environment.DEPLOY_URL) {
      const deploy = new URL(environment.DEPLOY_URL);
      if (deploy.protocol === "https:" && !deploy.port && !deploy.username && !deploy.password && !deploy.search && !deploy.hash && deploy.pathname === "/" &&
          app.hostname.endsWith(".netlify.app") && deploy.hostname.endsWith(`--${app.hostname}`) &&
          /^[a-f0-9]{24}$/.test(deploy.hostname.slice(0, -(`--${app.hostname}`).length))) origins.push(deploy.origin);
    }
    return { baseUrl: url.href.replace(/\/$/, ""), cookieSecret: secret, sameSite: "lax" as const, origins };
  } catch { return null; }
}

function json(code: string, status: number) {
  return Response.json({ code }, { status, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

function secureResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

function sameOriginPost(request: Request) {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  return origin === new URL(request.url).origin && (!site || site === "same-origin" || site === "none");
}

async function smallJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) return null;
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 8192)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let interrupted = false;
  const cancel = () => { interrupted = true; void reader.cancel().catch(() => undefined); };
  const timer = setTimeout(cancel, 5_000);
  request.signal.addEventListener("abort", cancel, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      if (request.signal.aborted) { cancel(); return null; }
      const { value, done } = await reader.read();
      if (interrupted) return null;
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); return null; }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
}

async function completeOAuth(request: Request, configuration: NonNullable<ReturnType<typeof neonServerConfiguration>>) {
  const url = new URL(request.url);
  const verifier = url.searchParams.get("neon_auth_session_verifier");
  const hasChallenge = /(?:^|;\s*)__Secure-neon-auth\.session_chall(?:e|a)nge=[^;]+/.test(request.headers.get("cookie") ?? "");
  // A callback without the matching first-party challenge cannot authenticate.
  if (!verifier || verifier.length > 4096 || !hasChallenge ||
      [...url.searchParams.keys()].some(key => key !== "neon_auth_session_verifier") ||
      url.searchParams.getAll("neon_auth_session_verifier").length !== 1) {
    return secureResponse(new Response(null, { status: 303, headers: { Location: "/auth/complete?error=oauth" } }));
  }
  const { processAuthMiddleware } = await import("@neondatabase/auth/server");
  const result = await processAuthMiddleware({
    ...configuration, request, pathname: url.pathname,
    skipRoutes: ["/api/auth/complete"], loginUrl: "/auth/complete", logLevel: "silent"
  });
  // All toolkit decisions are handled. Only a successful, state-bound verifier
  // exchange reaches the UI completion page; neither tokens nor returnTo travel
  // in the redirect URL. Cookies must remain separate (Expires contains commas).
  const response = new Response(null, { status: 303, headers: {
    Location: result.action === "redirect_oauth" ? "/auth/complete" : "/auth/complete?error=oauth"
  } });
  for (const cookie of result.cookies ?? []) response.headers.append("Set-Cookie", cookie);
  return secureResponse(response);
}

export async function handleNeonAuthRequest(request: Request, segments: string[]) {
  const configuration = neonServerConfiguration();
  if (!configuration) return json("AUTH_PROVIDER_UNAVAILABLE", 503);
  if (!configuration.origins.includes(new URL(request.url).origin)) return json("AUTH_ORIGIN_REJECTED", 403);
  const path = segments.join("/");
  // Fixed route allowlist prevents this from becoming an arbitrary provider or
  // account-administration proxy. Password/signup/email routes stay disabled.
  const allowed = request.method === "GET" ? ["get-session", "token", "complete"] :
    request.method === "POST" ? ["sign-in/social", "sign-out"] : [];
  if (!segments.length || segments.some(segment => !/^[a-z-]+$/.test(segment)) || !allowed.includes(path)) {
    return json("AUTH_ROUTE_NOT_AVAILABLE", 404);
  }
  const url = new URL(request.url);
  if (path === "complete") {
    try { return await completeOAuth(request, configuration); }
    catch { return secureResponse(new Response(null, { status: 303, headers: { Location: "/auth/complete?error=oauth" } })); }
  }
  if (url.search) return json("INVALID_AUTH_REQUEST", 400);
  let proxyRequest = request;
  if (request.method === "POST") {
    if (!sameOriginPost(request)) return json("AUTH_ORIGIN_REJECTED", 403);
    const body = path === "sign-out" && !request.body ? {} : await smallJson(request);
    if (!body) return json("INVALID_AUTH_REQUEST", 400);
    if (path === "sign-in/social") {
      const callbackURL = `${url.origin}/api/auth/complete`;
      if (body.provider !== "google" || body.callbackURL !== callbackURL ||
          Object.keys(body).some(key => !["provider", "callbackURL"].includes(key))) return json("INVALID_AUTH_REQUEST", 400);
      proxyRequest = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ provider: "google", callbackURL }) });
    } else {
      if (Object.keys(body).length) return json("INVALID_AUTH_REQUEST", 400);
      // JSON validation consumed the original body. Give the toolkit a fresh,
      // canonical request rather than an already-read stream.
      proxyRequest = new Request(request.url, { method: "POST", headers: request.headers, body: "{}" });
    }
  }
  try {
    const { handleAuthProxyRequest } = await import("@neondatabase/auth/server");
    return secureResponse(await handleAuthProxyRequest({ ...configuration, request: proxyRequest, path }));
  } catch { return json("AUTH_PROVIDER_UNAVAILABLE", 502); }
}
