// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as authSession from "../lib/auth-session";
import { useMarketplaceSession } from "../lib/use-marketplace-session";

function user(id: string) {
  return { id, email: `${id}@example.com`, role: "USER" };
}

function profile(id: string) {
  return { id: `${id}-profile`, email: `${id}@example.com`, displayName: id, avatarUrl: null, school: null, city: null, role: "renter", eduEmailVerified: false, phoneVerified: false, wechat: null, instagram: null, bio: null };
}

function json(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function sessionFetch() {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "guest";
    return json(String(input).endsWith("/auth/me") ? user(token) : profile(token));
  }));
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("marketplace session isolation", () => {
  it("replaces private profile data on same-tab sign-in and removes it on logout", async () => {
    sessionFetch();
    authSession.writeStoredAuthSession("account-a");
    const { result } = renderHook(useMarketplaceSession);
    await waitFor(() => expect(result.current.user?.id).toBe("account-a"));

    act(() => authSession.writeStoredAuthSession("account-b"));
    expect(result.current.user?.id).not.toBe("account-a");
    expect(result.current.profile?.displayName).not.toBe("account-a");
    await waitFor(() => expect(result.current.user?.id).toBe("account-b"));

    act(() => authSession.clearStoredAuthSession());
    expect(result.current).toMatchObject({ token: null, user: null, profile: null, loading: false, error: null });
  });

  it.each(["storage", "focus", "visibilitychange"])("resynchronizes a replaced stored session on %s", async (eventName) => {
    sessionFetch();
    authSession.writeStoredAuthSession("account-a");
    const { result } = renderHook(useMarketplaceSession);
    await waitFor(() => expect(result.current.user?.id).toBe("account-a"));
    act(() => {
      localStorage.setItem("sublet_auth_session", JSON.stringify({ version: 1, accessToken: "account-b" }));
      if (eventName === "visibilitychange") document.dispatchEvent(new Event(eventName));
      else window.dispatchEvent(new Event(eventName));
    });
    await waitFor(() => expect(result.current.user?.id).toBe("account-b"));
  });

  it.each([false, true])("discards late profile results and failures from a previous account (reject=%s)", async (reject) => {
    let settleOld!: () => void;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const token = new Headers(init?.headers).get("Authorization")?.replace("Bearer ", "") ?? "guest";
      if (token === "account-a" && String(input).endsWith("/profiles/me")) {
        await new Promise<void>((resolve, rejectPromise) => {
          settleOld = () => reject ? rejectPromise(new Error("old account failed")) : resolve();
        });
      }
      return json(String(input).endsWith("/auth/me") ? user(token) : profile(token));
    }));
    authSession.writeStoredAuthSession("account-a");
    const { result } = renderHook(useMarketplaceSession);
    await waitFor(() => expect(settleOld).toBeTypeOf("function"));
    act(() => authSession.writeStoredAuthSession("account-b"));
    await waitFor(() => expect(result.current.user?.id).toBe("account-b"));
    await act(async () => settleOld());
    expect(result.current.user?.id).toBe("account-b");
    expect(result.current.profile?.displayName).toBe("account-b");
    expect(result.current.error).toBeNull();
  });

  it("rejects a captured token after replacement or logout before a write can start", () => {
    const assertCurrentAuthSession = (authSession as typeof authSession & { assertCurrentAuthSession?: (token: string | null) => void }).assertCurrentAuthSession;
    expect(assertCurrentAuthSession).toBeTypeOf("function");
    authSession.writeStoredAuthSession("account-a");
    expect(() => assertCurrentAuthSession!("account-a")).not.toThrow();
    authSession.writeStoredAuthSession("account-b");
    expect(() => assertCurrentAuthSession!("account-a")).toThrow();
    authSession.clearStoredAuthSession();
    expect(() => assertCurrentAuthSession!("account-b")).toThrow();
    expect(() => assertCurrentAuthSession!(null)).toThrow();
  });
});
