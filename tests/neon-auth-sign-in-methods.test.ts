import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toolkit = vi.hoisted(() => ({ proxy: vi.fn(), middleware: vi.fn() }));
vi.mock("@neondatabase/auth/server", () => ({ handleAuthProxyRequest: toolkit.proxy, processAuthMiddleware: toolkit.middleware }));

import { enabledAuthMethods, signInViaPhrase } from "../lib/auth-methods";
import { handleNeonAuthRequest } from "../lib/neon-auth-server";

const origin = "https://sublet-pipeline-demo-zihao.netlify.app";
const baseUrl = "https://ep-psw-test.neonauth.us-east-1.aws.neon.tech/neondb/auth";
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`${origin}/api/auth/${path}`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body)
});
const sessionCookie = "__Secure-neon-auth.session_token=opaque; Path=/; Secure; HttpOnly; SameSite=Lax";

beforeEach(() => {
  for (const [name, value] of Object.entries({ NEXT_PUBLIC_AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: baseUrl, NEON_AUTH_COOKIE_SECRET: "n".repeat(40), NEON_AUTH_APP_ORIGIN: origin, NEXT_PUBLIC_AUTH_METHODS: "google,github,email,phone" })) vi.stubEnv(name, value);
  toolkit.proxy.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("configured sign-in methods", () => {
  it("parses the build list and falls back to Google when nothing can create an account", () => {
    expect(enabledAuthMethods("google,email,phone")).toEqual(["google", "email", "phone"]);
    expect(enabledAuthMethods(" email , email ,sms")).toEqual(["email"]);
    expect(enabledAuthMethods("phone")).toEqual(["google"]);
    expect(enabledAuthMethods("")).toEqual(["google"]);
    expect(signInViaPhrase(["google"])).toBe("使用 Google 账户登录");
    expect(signInViaPhrase(["google", "email", "phone"])).toBe("使用 Google、邮箱验证码或手机号登录");
  });
});

describe("email code proxy", () => {
  it("sends only a canonical sign-in request and never returns provider data", async () => {
    toolkit.proxy.mockResolvedValue(Response.json({ success: true, extra: "x" }, { headers: { "set-auth-token": "secret" } }));
    const response = await handleNeonAuthRequest(post("email-otp/send-verification-otp", { email: " Person@Example.COM ", type: "sign-in" }), ["email-otp", "send-verification-otp"]);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-auth-token")).toBeNull();
    const forwarded = toolkit.proxy.mock.calls[0][0];
    expect(forwarded.path).toBe("email-otp/send-verification-otp");
    expect(await forwarded.request.json()).toEqual({ email: "person@example.com", type: "sign-in" });
  });

  it("returns first-party session cookies but strips the session token body and auth headers", async () => {
    toolkit.proxy.mockResolvedValue(new Response(JSON.stringify({ token: "upstream-session-token", user: { id: "u" } }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie, "set-auth-jwt": "jwt", "set-auth-token": "token" }
    }));
    const response = await handleNeonAuthRequest(post("sign-in/email-otp", { email: "person@example.com", otp: "123456" }), ["sign-in", "email-otp"]);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe(JSON.stringify({ ok: true }));
    expect(response.headers.getSetCookie()).toEqual([sessionCookie]);
    expect(response.headers.get("set-auth-jwt")).toBeNull();
    expect(response.headers.get("set-auth-token")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each([
    [{ email: "person@example.com", type: "email-verification" }, "email-otp/send-verification-otp"],
    [{ email: "person@example.com", type: "forget-password" }, "email-otp/send-verification-otp"],
    [{ email: "not-an-email", type: "sign-in" }, "email-otp/send-verification-otp"],
    [{ email: `${"a".repeat(250)}@x.co`, type: "sign-in" }, "email-otp/send-verification-otp"],
    [{ email: "person@example.com", type: "sign-in", callbackURL: "https://evil.com" }, "email-otp/send-verification-otp"],
    [{ email: "person@example.com", otp: "12345" }, "sign-in/email-otp"],
    [{ email: "person@example.com", otp: 123456 }, "sign-in/email-otp"],
    [{ email: "person@example.com", otp: "123456", name: "Admin", role: "ADMIN" }, "sign-in/email-otp"]
  ])("rejects non-canonical email code requests %#", async (body, path) => {
    expect((await handleNeonAuthRequest(post(path, body), path.split("/"))).status).toBe(400);
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });

  it.each([
    [400, { code: "INVALID_OTP", message: "raw provider text" }, 400, "EMAIL_CODE_INVALID"],
    [400, { code: "OTP_EXPIRED" }, 400, "EMAIL_CODE_EXPIRED"],
    [403, { code: "TOO_MANY_ATTEMPTS" }, 400, "EMAIL_CODE_EXPIRED"],
    [403, { code: "SIGNUP_NOT_ALLOWED" }, 400, "EMAIL_CODE_INVALID"],
    [403, {}, 400, "EMAIL_CODE_REJECTED"],
    [429, {}, 429, "AUTH_RATE_LIMITED"],
    [500, { stack: "secret" }, 502, "AUTH_PROVIDER_UNAVAILABLE"],
    [400, { code: "<script>" }, 400, "EMAIL_CODE_REJECTED"]
  ])("maps provider status %i to a fixed outcome", async (status, body, expectedStatus, code) => {
    toolkit.proxy.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Set-Cookie": sessionCookie } }));
    const response = await handleNeonAuthRequest(post("sign-in/email-otp", { email: "person@example.com", otp: "123456" }), ["sign-in", "email-otp"]);
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ code });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("keeps email routes closed unless the build enables them, and refuses cross-site writes", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "google");
    expect((await handleNeonAuthRequest(post("sign-in/email-otp", { email: "person@example.com", otp: "123456" }), ["sign-in", "email-otp"])).status).toBe(404);
    vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "google,email");
    expect((await handleNeonAuthRequest(post("sign-in/email-otp", { email: "person@example.com", otp: "123456" }, { Origin: "https://evil.com" }), ["sign-in", "email-otp"])).status).toBe(403);
    for (const segments of [["sign-up", "email"], ["sign-in", "email"], ["email-otp", "reset-password"], ["email-otp", "verify-email"], ["forget-password", "email-otp"], ["phone-number", "send-otp"]]) {
      expect((await handleNeonAuthRequest(post(segments.join("/"), { email: "person@example.com" }), segments)).status).toBe(404);
    }
    expect(toolkit.proxy).not.toHaveBeenCalled();
  });
});

describe("social providers", () => {
  const social = (provider: string) => post("sign-in/social", { provider, callbackURL: `${origin}/api/auth/complete` });
  it("forwards GitHub only when the build enables it", async () => {
    toolkit.proxy.mockResolvedValue(new Response("{}"));
    expect((await handleNeonAuthRequest(social("github"), ["sign-in", "social"])).status).toBe(200);
    expect(await toolkit.proxy.mock.calls[0][0].request.json()).toEqual({ provider: "github", callbackURL: `${origin}/api/auth/complete` });
    vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "google,email");
    expect((await handleNeonAuthRequest(social("github"), ["sign-in", "social"])).status).toBe(400);
    vi.stubEnv("NEXT_PUBLIC_AUTH_METHODS", "email");
    expect((await handleNeonAuthRequest(social("google"), ["sign-in", "social"])).status).toBe(404);
    expect((await handleNeonAuthRequest(social("vercel"), ["sign-in", "social"])).status).toBe(404);
  });
});
