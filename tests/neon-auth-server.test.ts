import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toolkit = vi.hoisted(() => ({ proxy: vi.fn(), middleware: vi.fn() }));
vi.mock("@neondatabase/auth/server", () => ({ handleAuthProxyRequest: toolkit.proxy, processAuthMiddleware: toolkit.middleware }));

import { handleNeonAuthRequest, neonServerConfiguration } from "../lib/neon-auth-server";

const origin = "https://sublet-pipeline-demo-zihao.netlify.app";
const baseUrl = "https://ep-psw-test.neonauth.us-east-1.aws.neon.tech/neondb/auth";
const configuration = () => ({ NEXT_PUBLIC_AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: baseUrl, NEON_AUTH_COOKIE_SECRET: "n".repeat(40), NEON_AUTH_APP_ORIGIN: origin });
const social = (body: unknown = { provider: "google", callbackURL: `${origin}/api/auth/complete` }, headers: Record<string, string> = {}) => new Request(`${origin}/api/auth/sign-in/social`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
});

beforeEach(() => {
  for (const [name, value] of Object.entries(configuration())) vi.stubEnv(name, value);
  toolkit.proxy.mockReset().mockResolvedValue(new Response("{}", { headers: { "Set-Cookie": "__Secure-neon-auth.session_challenge=challenge; Path=/; Secure; HttpOnly; SameSite=Lax" } }));
  toolkit.middleware.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("Neon framework-independent Next 15 adapter", () => {
  it("requires no Neon configuration in ordinary email mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "email");
    expect(neonServerConfiguration({})).toBeNull();
    const response = await handleNeonAuthRequest(new Request(`${origin}/api/auth/token`), ["token"]);
    expect(response.status).toBe(503);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it("accepts the actual managed cluster hostname without accepting lookalikes", () => {
    expect(neonServerConfiguration({ ...configuration(), NEON_AUTH_BASE_URL: "https://ep-red-shadow-b4rrx7ym.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth" })).not.toBeNull();
    for (const host of ["ep-test.neonauth.c-6.us-east-2.aws.neon.tech.evil.com", "ep-test.neonauth.evil.us-east-2.aws.neon.tech", "ep-test.neonauth.c-1234.us-east-2.aws.neon.tech", "ep-test.neonauth.c-6.c-7.us-east-2.aws.neon.tech"]) {
      expect(neonServerConfiguration({ ...configuration(), NEON_AUTH_BASE_URL: `https://${host}/neondb/auth` })).toBeNull();
    }
  });

  it.each([
    "https://attacker.com/auth", "https://ep-test.neonauth.us-east-1.aws.neon.tech.evil.com/neondb/auth",
    "http://ep-test.neonauth.us-east-1.aws.neon.tech/neondb/auth", "https://user:pass@ep-test.neonauth.us-east-1.aws.neon.tech/neondb/auth",
    `${baseUrl}?target=http://127.0.0.1`, `${baseUrl}#override`, `${baseUrl}/../../secret`, "https://127.0.0.1/neondb/auth"
  ])("refuses unsafe provider endpoint %s", value => {
    expect(neonServerConfiguration({ ...configuration(), NEON_AUTH_BASE_URL: value })).toBeNull();
  });

  it("pins the website origin and accepts only its exact provider-created immutable deployment", async () => {
    const deploy = `https://${"a".repeat(24)}--sublet-pipeline-demo-zihao.netlify.app`;
    expect(neonServerConfiguration({ ...configuration(), NETLIFY: "true", DEPLOY_URL: deploy })?.origins).toEqual([origin, deploy]);
    expect(neonServerConfiguration({ ...configuration(), DEPLOY_URL: deploy })?.origins).toEqual([origin]);
    expect(neonServerConfiguration({ ...configuration(), NETLIFY: "true", DEPLOY_URL: "https://another.netlify.app" })?.origins).toEqual([origin]);
    const response = await handleNeonAuthRequest(new Request("https://forged-host.com/api/auth/token", { headers: { "X-Forwarded-Host": new URL(origin).host } }), ["token"]);
    expect(response.status).toBe(403);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it("forwards only the fixed social route and preserves first-party cookie response", async () => {
    const response = await handleNeonAuthRequest(social(), ["sign-in", "social"]);
    expect(response.status).toBe(200);
    expect(toolkit.proxy).toHaveBeenCalledWith(expect.objectContaining({ baseUrl, path: "sign-in/social", sameSite: "lax" }));
    expect(await toolkit.proxy.mock.calls[0][0].request.json()).toEqual({ provider: "google", callbackURL: `${origin}/api/auth/complete` });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    ["sign-up", "email"], ["admin", "list-users"], ["..", "token"], ["https:", "evil.com"], ["get-session%2f.."], ["callback", "google"]
  ].map(segments => ({ segments })))("rejects unsupported auth routes", async ({ segments }) => {
    const response = await handleNeonAuthRequest(social(), segments);
    expect(response.status).toBe(404);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it.each([
    { provider: "github", callbackURL: `${origin}/api/auth/complete` },
    { provider: "google", callbackURL: "https://evil.com/steal" },
    { provider: "google", callbackURL: `${origin}/api/auth/complete`, errorCallbackURL: "https://evil.com" },
    { provider: "google", callbackURL: `${origin}/api/auth/complete`, additionalData: { role: "ADMIN" } },
    { provider: "google", callbackURL: `${origin}/api/auth/complete`, name: "x".repeat(9000) }
  ])("rejects unauthorized provider or request data", async body => {
    expect((await handleNeonAuthRequest(social(body), ["sign-in", "social"])).status).toBe(400);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{ Origin: "https://evil.com" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }])("rejects cross-origin auth writes", async headers => {
    expect((await handleNeonAuthRequest(social(undefined, headers), ["sign-in", "social"])).status).toBe(403);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it("accepts the SDK's empty logout request and rejects query injection", async () => {
    const request = new Request(`${origin}/api/auth/sign-out`, { method: "POST", headers: { Origin: origin } });
    expect((await handleNeonAuthRequest(request, ["sign-out"])).status).toBe(200);
    expect((await handleNeonAuthRequest(new Request(`${origin}/api/auth/token?target=admin`), ["token"])).status).toBe(400);
  });

  it("cancels a stalled POST body within five seconds and clears its timer", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const request = new Request(`${origin}/api/auth/sign-in/social`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body, duplex: "half"
    } as RequestInit & { duplex: "half" });
    const result = handleNeonAuthRequest(request, ["sign-in", "social"]);
    await vi.advanceTimersByTimeAsync(5_001);
    expect((await result).status).toBe(400);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it("completes the state-bound OAuth exchange and preserves separate cookies", async () => {
    toolkit.middleware.mockResolvedValue({ action: "redirect_oauth", redirectUrl: new URL("https://ignored.example"), cookies: [
      "__Secure-neon-auth.session_token=token; Path=/; Secure; HttpOnly; SameSite=Lax",
      "__Secure-neon-auth.session_challenge=; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Path=/; Secure; HttpOnly"
    ] });
    const request = new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=secret`, { headers: { Cookie: "__Secure-neon-auth.session_challenge=challenge" } });
    const response = await handleNeonAuthRequest(request, ["complete"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/complete?flow=google");
    expect(response.headers.getSetCookie()).toHaveLength(2);
    expect(response.headers.get("Location")).not.toMatch(/secret|token|ignored/);
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it.each(["allow", "redirect_login"])('handles toolkit decision "%s" without creating a session', async action => {
    toolkit.middleware.mockResolvedValue({ action, cookies: [] });
    const request = new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=verifier`, { headers: { Cookie: "__Secure-neon-auth.session_challenge=challenge" } });
    expect((await handleNeonAuthRequest(request, ["complete"])).headers.get("Location")).toBe("/auth/complete?error=oauth");
  });

  it("refuses missing state, duplicate verifiers and arbitrary callback parameters before exchange", async () => {
    for (const request of [
      new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=secret`),
      new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=a&neon_auth_session_verifier=b`, { headers: { Cookie: "__Secure-neon-auth.session_challenge=c" } }),
      new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=a&returnTo=https://evil.com`, { headers: { Cookie: "__Secure-neon-auth.session_challenge=c" } })
    ]) expect((await handleNeonAuthRequest(request, ["complete"])).headers.get("Location")).toBe("/auth/complete?error=oauth");
    expect(toolkit.middleware).not.toHaveBeenCalled();
  });
});
