import { createAuthClient } from "@neondatabase/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleNeonAuthRequest } from "../lib/neon-auth-server";

const origin = "https://sublet-pipeline-demo-zihao.netlify.app";
const base = "https://ep-psw-test.neonauth.us-east-1.aws.neon.tech/neondb/auth";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("published Neon vanilla SDK and real Fetch-adapter contract", () => {
  it("supports Google social and logout request bodies without a Next 16 adapter", async () => {
    for (const [name, value] of Object.entries({ NEXT_PUBLIC_AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: base, NEON_AUTH_COOKIE_SECRET: "n".repeat(40), NEON_AUTH_APP_ORIGIN: origin })) vi.stubEnv(name, value);
    const providerRequests: Array<{ path: string; body: unknown }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin === origin) {
        // Browser fetch supplies the same-origin Origin header automatically.
        if (request.method === "POST") request.headers.set("Origin", origin);
        return handleNeonAuthRequest(request, url.pathname.replace(/^\/api\/auth\//, "").split("/"));
      }
      expect(url.origin).toBe(new URL(base).origin);
      providerRequests.push({ path: url.pathname, body: request.body ? await request.json() : null });
      if (url.pathname.endsWith("/sign-in/social")) return Response.json({ url: "https://accounts.google.com/o/oauth2/auth", redirect: true }, { headers: {
        "Set-Cookie": "__Secure-neon-auth.session_challenge=challenge; Path=/; Secure; HttpOnly; SameSite=Lax"
      } });
      if (url.pathname.endsWith("/sign-out")) return Response.json({ success: true });
      if (url.pathname.endsWith("/token")) return Response.json({ token: "test-provider-jwt" });
      throw new Error("Unexpected provider endpoint");
    });
    vi.stubGlobal("fetch", fetch);
    const client = createAuthClient(`${origin}/api/auth`);
    const login = await client.signIn.social({ provider: "google", callbackURL: `${origin}/api/auth/complete` });
    expect(login.error).toBeNull();
    expect(login.data?.url).toBe("https://accounts.google.com/o/oauth2/auth");
    expect((await client.token()).data?.token).toBe("test-provider-jwt");
    expect((await client.signOut()).error).toBeNull();
    expect(providerRequests).toEqual([
      { path: "/neondb/auth/sign-in/social", body: { provider: "google", callbackURL: `${origin}/api/auth/complete` } },
      { path: "/neondb/auth/token", body: null },
      { path: "/neondb/auth/sign-out", body: {} }
    ]);
  });

  it("uses the real toolkit to exchange a challenge, mint first-party session data and remove URL secrets", async () => {
    for (const [name, value] of Object.entries({ NEXT_PUBLIC_AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: base, NEON_AUTH_COOKIE_SECRET: "n".repeat(40), NEON_AUTH_APP_ORIGIN: origin })) vi.stubEnv(name, value);
    const now = new Date().toISOString();
    const payload = {
      session: { id: "test-session", userId: "test-user", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now, updatedAt: now },
      user: { id: "test-user", name: "Test", email: "test@example.com", emailVerified: true, createdAt: now, updatedAt: now }
    };
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      expect(`${url.origin}${url.pathname}`).toBe(`${base}/get-session`);
      if (url.search) {
        expect(url.searchParams.get("neon_auth_session_verifier")).toBe("test-verifier");
        expect(request.headers.get("cookie")).toContain("session_challenge=test-challenge");
        const headers = new Headers();
        headers.append("Set-Cookie", "__Secure-neon-auth.session_token=test-token; Path=/; Secure; HttpOnly; SameSite=None; Partitioned");
        headers.append("Set-Cookie", "__Secure-neon-auth.session_challenge=; Expires=Wed, 01 Jan 2020 00:00:00 GMT; Path=/; Secure; HttpOnly");
        return Response.json(payload, { headers });
      }
      expect(request.headers.get("cookie")).toBe("__Secure-neon-auth.session_token=test-token");
      expect(request.signal).toBeDefined();
      return Response.json(payload);
    });
    vi.stubGlobal("fetch", fetch);
    const response = await handleNeonAuthRequest(new Request(`${origin}/api/auth/complete?neon_auth_session_verifier=test-verifier`, { headers: { Cookie: "__Secure-neon-auth.session_challenge=test-challenge" } }), ["complete"]);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("/auth/complete");
    expect(fetch).toHaveBeenCalledTimes(2);
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(3);
    expect(cookies.some(cookie => cookie.startsWith("__Secure-neon-auth.local.session_data="))).toBe(true);
    expect(cookies.every(cookie => /Secure/.test(cookie) && /HttpOnly/.test(cookie) && /SameSite=Lax/i.test(cookie))).toBe(true);
    expect(cookies.join(" ")).not.toContain("Partitioned");
    expect(response.headers.get("Location")).not.toContain("test-verifier");
  });
});
