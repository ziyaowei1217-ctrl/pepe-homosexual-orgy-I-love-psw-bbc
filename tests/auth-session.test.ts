import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStoredAuthSession,
  readStoredAuthSession,
  writeStoredAuthSession
} from "../lib/auth-session";

describe("auth session storage", () => {
  const storage = new Map<string, string>();
  const tabStorage = new Map<string, string>();

  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: {
        sessionStorage: { getItem:(key:string)=>tabStorage.get(key)??null, setItem:(key:string,value:string)=>tabStorage.set(key,value), removeItem:(key:string)=>tabStorage.delete(key) },
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
    tabStorage.clear();
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

    window.localStorage.setItem("sublet:admin-step-up:v1", "old-admin-proof");
    window.sessionStorage.setItem("sublet:admin-step-up:v1", "old-tab-proof");
    clearStoredAuthSession();

    expect(window.localStorage.getItem("sublet_auth_session")).toBeNull();
    expect(window.localStorage.getItem("sublet_token")).toBeNull();
    expect(window.localStorage.getItem("sublet:admin-step-up:v1")).toBeNull();
    expect(window.sessionStorage.getItem("sublet:admin-step-up:v1")).toBeNull();
  });
});
