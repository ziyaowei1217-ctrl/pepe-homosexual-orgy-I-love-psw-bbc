// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { writeStoredAuthSession } from "../lib/auth-session";

const mocks = vi.hoisted(() => ({ social: vi.fn(), token: vi.fn(), signOut: vi.fn(), post: vi.fn(), create: vi.fn(), fetch: vi.fn() }));
vi.mock("@neondatabase/auth", () => ({ createAuthClient: mocks.create }));
vi.mock("../lib/api", () => ({ apiPost: mocks.post }));

beforeEach(() => {
  vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "neon"); sessionStorage.clear(); localStorage.clear(); vi.stubGlobal("crypto", webcrypto);
  mocks.create.mockReturnValue({ signIn: { social: mocks.social }, token: mocks.token, signOut: mocks.signOut });
  mocks.social.mockResolvedValue({ data: {}, error: null });
  mocks.fetch.mockImplementation(async () => Response.json({ token: "verified-upstream-jwt" }));
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.signOut.mockResolvedValue({ data: {}, error: null });
  mocks.post.mockResolvedValue({ accessToken: "app-jwt", user: { id: "user-1" }, isNewUser: false });
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe("shared account sign-in boundary", () => {
  it("uses the same-origin proxy and fixed Google callback, while retaining the internal destination locally", async () => {
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox?listingId=123");
    expect(mocks.create).toHaveBeenCalledWith(`${window.location.origin}/api/auth`);
    expect(mocks.social).toHaveBeenCalledWith({ provider: "google", callbackURL: `${window.location.origin}/api/auth/complete` });
    expect(auth.consumeSignInAttempt().returnTo).toBe("/inbox?listingId=123");
    expect(() => auth.consumeSignInAttempt()).toThrow();
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])("rejects external return target %s", async target => {
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn(target);
    expect(auth.consumeSignInAttempt().returnTo).toBe("/");
  });
  it("passes only the signed provider JWT to the backend and retains the backend session response", async () => {
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox");
    await expect(auth.exchangeGoogleSession(auth.consumeSignInAttempt())).resolves.toMatchObject({ accessToken: "app-jwt" });
    expect(mocks.post).toHaveBeenCalledWith("/auth/neon/exchange", { token: "verified-upstream-jwt" });
    expect(mocks.fetch).toHaveBeenCalledWith(`${window.location.origin}/api/auth/token`, expect.objectContaining({ credentials: "same-origin", cache: "no-store", redirect: "error" }));
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it("does not contact the backend when the provider session is unavailable", async () => {
    mocks.fetch.mockResolvedValueOnce(Response.json({ code: "UNAUTHORIZED" }, { status: 401 }));
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox");
    await expect(auth.exchangeGoogleSession(auth.consumeSignInAttempt())).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it.each([
    () => Response.json({ session: { token: "cookie-not-jwt" }, user: { id: "cached-user" } }),
    () => Response.json({ token: 123 }),
    () => Response.json({ token: "x".repeat(8193) }),
    () => new Response("not-json", { headers: { "Content-Type": "application/json" } }),
    () => new Response("<html>sign in</html>", { headers: { "Content-Type": "text/html" } }),
    () => new Response("x".repeat(16_385), { headers: { "Content-Type": "application/json" } })
  ])("rejects unexpected token responses before contacting the backend", async response => {
    mocks.fetch.mockResolvedValueOnce(response());
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox");
    await expect(auth.exchangeGoogleSession(auth.consumeSignInAttempt())).rejects.toThrow();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("bounds a stalled token response body and cancels its stream", async () => {
    vi.useFakeTimers();
    try {
      const cancel = vi.fn();
      mocks.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/json" } }));
      const auth = await import("../lib/neon-auth-client");
      await auth.startGoogleSignIn("/inbox");
      const result = auth.exchangeGoogleSession(auth.consumeSignInAttempt()).catch(error => error);
      await vi.advanceTimersByTimeAsync(auth.PROVIDER_TOKEN_TIMEOUT_MS + 1);
      expect(auth.signInFailureMessage(await result)).toContain("登录服务暂时无法连接");
      expect(cancel).toHaveBeenCalledOnce();
      expect(mocks.post).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("shows a safe network explanation without exposing provider errors", async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError("Failed to fetch private-token-or-provider-details"));
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox");
    const error = await auth.exchangeGoogleSession(auth.consumeSignInAttempt()).catch(error => error);
    expect(auth.signInFailureMessage(error)).toContain("网络连接失败");
    expect(auth.signInFailureMessage(error)).not.toContain("private-token");
    expect(auth.signInFailureMessage(new Error("sensitive-server-message"))).not.toContain("sensitive-server-message");
  });

  it("does not open the provider for the unchanged email mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_PROVIDER", "");
    const auth = await import("../lib/neon-auth-client");
    const bytes = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode("null"));
    const sessionHash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    await expect(auth.exchangeGoogleSession({ version: 1, id: crypto.randomUUID(), createdAt: Date.now(), returnTo: "/account", sessionHash })).rejects.toThrow();
    await auth.endGoogleSession();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("reports provider sign-out failure instead of pretending it succeeded", async () => {
    mocks.signOut.mockResolvedValue({ error: { message: "offline" } });
    const auth = await import("../lib/neon-auth-client");
    await expect(auth.endGoogleSession()).rejects.toThrow("退出未完成");
  });

  it("stores a bounded one-time intent with a hash instead of a second copy of the app credential", async () => {
    writeStoredAuthSession("sensitive-existing-session-token");
    const auth = await import("../lib/neon-auth-client");
    await auth.startGoogleSignIn("/inbox");
    const raw = sessionStorage.getItem("psw-sign-in-attempt")!;
    expect(raw).not.toContain("sensitive-existing-session-token");
    const attempt = auth.consumeSignInAttempt();
    expect(attempt).toMatchObject({ version: 1, returnTo: "/inbox", sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(attempt.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(auth.assertSignInAttemptCurrent(attempt)).resolves.toBe("sensitive-existing-session-token");
  });

  it("fails before opening Google when the browser cannot retain the pending attempt", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked storage"); });
    const auth = await import("../lib/neon-auth-client");
    await expect(auth.startGoogleSignIn("/inbox")).rejects.toThrow("blocked storage");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.social).not.toHaveBeenCalled();
  });

  it("invalidates a failed or explicitly signed-out attempt", async () => {
    const auth = await import("../lib/neon-auth-client");
    mocks.social.mockResolvedValueOnce({ error: { message: "provider offline" } });
    await expect(auth.startGoogleSignIn("/inbox")).rejects.toThrow();
    expect(() => auth.consumeSignInAttempt()).toThrow();
    await auth.startGoogleSignIn("/inbox");
    await auth.endGoogleSession();
    expect(() => auth.consumeSignInAttempt()).toThrow();
  });

  it.each(["null", "[]", "{}", "not-json", "x".repeat(4097)])("discards malformed stored attempts", async raw => {
    const auth = await import("../lib/neon-auth-client");
    sessionStorage.setItem("psw-sign-in-attempt", raw);
    expect(() => auth.consumeSignInAttempt()).toThrow();
    expect(sessionStorage.getItem("psw-sign-in-attempt")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
});
