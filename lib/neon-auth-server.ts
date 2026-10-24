import { enabledAuthMethods } from "./auth-methods";

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
    // A trusted operator may explicitly supply these build variables to the
    // function runtime; Netlify does not inject them into Functions by default.
    // Accept only this site's exact deploy URL, never Host/Forwarded headers
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
    // An explicit, non-secret query prevents hosting redirect layers from
    // inheriting the one-time verifier from the incoming callback URL.
    // This marker grants no authentication; the tab intent and JWT still do.
    Location: result.action === "redirect_oauth" ? "/auth/complete?flow=google" : "/auth/complete?error=oauth"
  } });
  for (const cookie of result.cookies ?? []) response.headers.append("Set-Cookie", cookie);
  return secureResponse(response);
}

// Sign-in methods this deployment exposes. Social providers and email codes
// must also be enabled in the Neon Auth project; this only narrows the proxy.
function enabledMethods() {
  const methods = enabledAuthMethods();
  return { social: methods.filter(method => method === "google" || method === "github"), email: methods.includes("email") };
}

const EMAIL_OTP_ROUTES = ["email-otp/send-verification-otp", "sign-in/email-otp"];
const MAX_EMAIL_LENGTH = 254;

function normalizedEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= MAX_EMAIL_LENGTH && /^[^\s@\p{Cc}]+@[^\s@\p{Cc}]+\.[^\s@\p{Cc}]+$/u.test(email) ? email : null;
}

async function upstreamErrorCode(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return null;
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); return null; }
      text += decoder.decode(value, { stream: true });
    }
    const parsed: unknown = JSON.parse(text + decoder.decode());
    const code = parsed && typeof parsed === "object" && "code" in parsed ? parsed.code : null;
    return typeof code === "string" && /^[A-Z0-9_]{1,64}$/.test(code) ? code : null;
  } catch { return null; } finally { reader.releaseLock(); }
}

// Email codes are sent and checked by Neon. The browser receives only fixed
// outcome codes plus the first-party session cookies: never the upstream JSON,
// which contains a session token, nor its auth/JWT response headers.
async function proxyEmailOtp(request: Request, path: string, body: Record<string, unknown>, configuration: NonNullable<ReturnType<typeof neonServerConfiguration>>) {
  const email = normalizedEmail(body.email);
  const keys = Object.keys(body).sort().join(",");
  let forwarded: Record<string, string>;
  if (path === "email-otp/send-verification-otp") {
    if (!email || keys !== "email,type" || body.type !== "sign-in") return json("INVALID_AUTH_REQUEST", 400);
    forwarded = { email, type: "sign-in" };
  } else {
    if (!email || keys !== "email,otp" || typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) return json("INVALID_AUTH_REQUEST", 400);
    forwarded = { email, otp: body.otp };
  }
  const { handleAuthProxyRequest } = await import("@neondatabase/auth/server");
  const upstream = await handleAuthProxyRequest({ ...configuration, request: new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(forwarded) }), path });
  if (upstream.ok) {
    void upstream.body?.cancel().catch(() => undefined);
    const response = Response.json({ ok: true }, { status: 200 });
    if (path === "sign-in/email-otp") for (const cookie of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return secureResponse(response);
  }
  const code = await upstreamErrorCode(upstream);
  if (upstream.status === 429 || code === "TOO_MANY_REQUESTS") return json("AUTH_RATE_LIMITED", 429);
  if (upstream.status >= 500) return json("AUTH_PROVIDER_UNAVAILABLE", 502);
  // A refused sign-up answers exactly like a wrong code for a known address, so
  // the response never shows which email addresses have accounts.
  if (code === "INVALID_OTP" || code === "SIGNUP_NOT_ALLOWED" || code === "SIGN_UP_DISABLED") return json("EMAIL_CODE_INVALID", 400);
  if (code === "OTP_EXPIRED" || code === "TOO_MANY_ATTEMPTS") return json("EMAIL_CODE_EXPIRED", 400);
  return json("EMAIL_CODE_REJECTED", 400);
}

export async function handleNeonAuthRequest(request: Request, segments: string[]) {
  const configuration = neonServerConfiguration();
  if (!configuration) return json("AUTH_PROVIDER_UNAVAILABLE", 503);
  if (!configuration.origins.includes(new URL(request.url).origin)) return json("AUTH_ORIGIN_REJECTED", 403);
  const path = segments.join("/");
  const methods = enabledMethods();
  // Fixed route allowlist prevents this from becoming an arbitrary provider or
  // account-administration proxy. Password, sign-up and account-change routes
  // stay disabled; email codes are available only when this build enables them.
  const allowed = request.method === "GET" ? ["get-session", "token", "complete"] :
    request.method === "POST" ? [...(methods.social.length ? ["sign-in/social"] : []), "sign-out", ...(methods.email ? EMAIL_OTP_ROUTES : [])] : [];
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
    if (EMAIL_OTP_ROUTES.includes(path)) {
      try { return await proxyEmailOtp(request, path, body, configuration); }
      catch { return json("AUTH_PROVIDER_UNAVAILABLE", 502); }
    }
    if (path === "sign-in/social") {
      const callbackURL = `${url.origin}/api/auth/complete`;
      if (typeof body.provider !== "string" || !(methods.social as string[]).includes(body.provider) || body.callbackURL !== callbackURL ||
          Object.keys(body).some(key => !["provider", "callbackURL"].includes(key))) return json("INVALID_AUTH_REQUEST", 400);
      proxyRequest = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ provider: body.provider, callbackURL }) });
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
