// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { createAuthClient } from "@neondatabase/auth";
import { afterEach, expect, it, vi } from "vitest";
import { startGoogleSignIn, consumeSignInAttempt, exchangeGoogleSession } from "../lib/neon-auth-client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

it("exchanges a fresh provider JWT even when the installed SDK has cached a session", async () => {
  vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon");
  vi.stubGlobal("crypto", webcrypto);
  const now = new Date().toISOString();
  const session = {
    session: { id: "session-1", token: "opaque-session-cookie-not-a-jwt", userId: "user-1", expiresAt: new Date(Date.now() + 60_000).toISOString(), createdAt: now, updatedAt: now },
    user: { id: "user-1", name: "Test", email: "test@example.com", emailVerified: true, createdAt: now, updatedAt: now }
  };
  const paths: string[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), window.location.origin);
    paths.push(url.pathname);
    if (url.pathname.endsWith("/sign-in/social")) return Response.json({ redirect: false });
    if (url.pathname.endsWith("/sign-out")) return Response.json({ success: true });
    if (url.pathname.endsWith("/get-session")) return Response.json(session);
    if (url.pathname === "/api/auth/token") return Response.json({ token: "fresh-provider-jwt" });
    if (url.pathname.endsWith("/auth/neon/exchange")) {
      expect(JSON.parse(String(init?.body))).toEqual({ token: "fresh-provider-jwt" });
      return Response.json({ accessToken: "app-session", user: { id: "user-1", email: "test@example.com", role: "USER" }, isNewUser: false });
    }
    throw new Error("Unexpected endpoint");
  });
  vi.stubGlobal("fetch", fetch);
  await startGoogleSignIn("/inbox");
  const sdk = createAuthClient(`${window.location.origin}/api/auth`);
  expect((await sdk.getSession()).data?.user.id).toBe("user-1");
  // The real SDK's /token hook shares the get-session cache. A cookie or
  // account response must never be substituted for the separately signed JWT.
  expect((await sdk.token()).data).not.toHaveProperty("token");
  await expect(exchangeGoogleSession(consumeSignInAttempt())).resolves.toMatchObject({ accessToken: "app-session" });
  expect(paths.filter(path => path === "/api/auth/token")).toHaveLength(1);
  await sdk.signOut();
});
