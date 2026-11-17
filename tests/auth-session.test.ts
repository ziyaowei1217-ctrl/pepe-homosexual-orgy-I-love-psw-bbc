import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStoredAuthSession,
  readStoredAuthSession,
  sessionUserId,
  writeStoredAuthSession
} from "../lib/auth-session";

describe("auth session storage", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => storage.set(key, value),
          removeItem: (key: string) => storage.delete(key),
          clear: () => storage.clear()
        }
      },
      configurable: true
    });
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("stores only the access token in a versioned envelope", () => {
    writeStoredAuthSession("token-123");

    const raw = window.localStorage.getItem("sublet_auth_session");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw ?? "{}")).toMatchObject({
      version: 1,
      accessToken: "token-123"
    });
    expect(raw).not.toContain("owner@example.com");

    expect(readStoredAuthSession()).toEqual({ accessToken: "token-123" });
  });

  it("ignores malformed or legacy session data", () => {
    window.localStorage.setItem("sublet_auth_session", "{broken");
    expect(readStoredAuthSession()).toBeNull();

    window.localStorage.setItem("sublet_auth_session", JSON.stringify({ accessToken: "missing-version" }));
    expect(readStoredAuthSession()).toBeNull();
  });

  it("clears both current and legacy token keys", () => {
    window.localStorage.setItem("sublet_auth_session", JSON.stringify({ version: 1, accessToken: "token-123" }));
    window.localStorage.setItem("sublet_token", "legacy-token");

    clearStoredAuthSession();

    expect(window.localStorage.getItem("sublet_auth_session")).toBeNull();
    expect(window.localStorage.getItem("sublet_token")).toBeNull();
  });

  it("treats denied browser storage as signed out without crashing page navigation", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new DOMException("Storage denied", "SecurityError"); });
    expect(readStoredAuthSession()).toBeNull();
  });

  it("reads the account id from an application session token and nothing from other strings", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(sessionUserId(`${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: "user-1", role: "USER" })}.signature`)).toBe("user-1");
    // base64url characters and text outside ASCII decode as the API wrote them.
    expect(sessionUserId(`h.${encode({ sub: "账户?>~~" })}.s`)).toBe("账户?>~~");
    for (const token of ["opaque-token", "a.b", "h..s", "h.%%%.s", `h.${encode("text")}.s`, `h.${encode({ sub: 42 })}.s`, `h.${encode({ sub: " " })}.s`, `h.${encode({})}.s`]) {
      expect(sessionUserId(token)).toBeNull();
    }
  });
});
