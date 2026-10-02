import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "../middleware";
import { canBrowseWebsiteDemo, isWebsiteDemo } from "../lib/website-demo";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

describe("opt-in website demo boundaries", () => {
  it("requires an explicit flag independently of the development fixture flag", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    vi.stubEnv("NEXT_PUBLIC_ENABLE_PREVIEW_DATA", "true");
    expect(isWebsiteDemo()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    expect(isWebsiteDemo()).toBe(true);
  });

  it.each(["/account", "/account/profile", "/admin", "/host", "/applications/new", "/inbox", "/trips", "/roommates/likes", "/roommates/teams", "/listing/mine", "/listing/%6dine", "/roommates/%6cikes", "/api/v1/auth/me"])("excludes private path %s", (path) => {
    expect(canBrowseWebsiteDemo(path)).toBe(false);
  });

  it.each(["/brand/psw-logo.svg", "/brand/psw-mark.svg", "/brand/psw-logo-white.svg", "/brand/psw-logo.png"])("serves the explicit public artwork %s without opening writes", async (path) => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    for (const method of ["GET", "HEAD"]) {
      const result = middleware(new NextRequest(`https://demo.example${path}`, { method }));
      expect(result.headers.get("x-middleware-next")).toBe("1");
      expect(result.headers.get("x-middleware-rewrite")).toBeNull();
      expect(result.headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
      expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    }
    const denied = middleware(new NextRequest(`https://demo.example${path}`, { method: "POST" }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: "WEBSITE_DEMO_READ_ONLY" });
  });

  it.each(["/brand/README.md", "/brand/.env", "/brand/psw-logo.svg.js", "/brand/psw-logo.svg/private", "/brand/%2e%2e/.env"])("keeps non-artwork branding paths isolated: %s", (path) => {
    expect(canBrowseWebsiteDemo(path)).toBe(false);
  });

  it.each(["production", "development"])("rewrites private pages without collecting their query in %s", (environment) => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", environment);
    const result = middleware(new NextRequest("https://demo.example/account?email=example@example.invalid"));
    expect(result.headers.get("x-middleware-rewrite")).toBe("https://demo.example/demo");
    expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    if (environment === "production") {
      expect(result.headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
      expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("rejects %s before page handling", async (method) => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    const result = middleware(new NextRequest("https://demo.example/account", { method }));
    expect(result.status).toBe(403);
    expect(result.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(await result.json()).toEqual({ code: "WEBSITE_DEMO_READ_ONLY" });
  });

  it("blocks unknown backend paths, preserves only local web health, and never allows configured API origins in the demo CSP", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://real-api.example/api/v1");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN", "https://real-uploads.example");
    const denied = middleware(new NextRequest("https://demo.example/api/v1/auth/me"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    const health = middleware(new NextRequest("https://demo.example/api/health"));
    expect(health.headers.get("x-middleware-next")).toBe("1");
    expect(health.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    const csp = middleware(new NextRequest("https://demo.example/")).headers.get("Content-Security-Policy")!;
    expect(csp).toContain("connect-src 'self';");
    expect(csp).not.toContain("real-api.example");
    expect(csp).not.toContain("real-uploads.example");
    expect(csp).toContain("'strict-dynamic'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
  });

  it("leaves normal production API routing intact when the demo flag is absent", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    const result = middleware(new NextRequest("https://web.example/account"));
    expect(result.headers.get("x-middleware-rewrite")).toBeNull();
    expect(result.headers.get("x-middleware-next")).toBe("1");
    expect(result.headers.get("X-Robots-Tag")).toBeNull();
    const api = middleware(new NextRequest("https://web.example/api/health"));
    expect(api.headers.get("x-middleware-next")).toBe("1");
    expect(api.headers.get("X-Robots-Tag")).toBeNull();
  });

  it("never sends API credentials or writes to the network in a demo build", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://real-api.example/api/v1");
    vi.stubEnv("API_INTERNAL_BASE_URL", "https://private-api.example/api/v1");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const api = await import("../lib/api");
    const listings = await api.apiGet<Array<{ id: string; trust: string }>>("/listings", "stale-token");
    expect(listings.length).toBeGreaterThan(100);
    expect(listings[0].trust).toContain("演示");
    for (const operation of [api.apiPost("/auth/email-code", { email: "example@example.invalid" }), api.apiPatch("/profiles/me", {}, "stale-token"), api.apiDelete("/listings/demo", "stale-token"), api.getAdminListingMediaContent("stale-token", "/api/v1/admin/listings/demo/media/demo/content"), api.apiGet("/auth/me", "stale-token")]) {
      await expect(operation).rejects.toMatchObject({ status: 403 });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores and never persists stale authentication in the demo", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    const getItem = vi.fn(() => '{"version":1,"accessToken":"stale-token"}');
    const setItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    const auth = await import("../lib/auth-session");
    expect(auth.readStoredAuthSession()).toBeNull();
    auth.writeStoredAuthSession("new-token");
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("blocks direct XHR uploads and Socket.IO before constructing transports", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    const xhr = vi.fn();
    vi.stubGlobal("XMLHttpRequest", xhr);
    const { putPresignedFile } = await import("../lib/listing-media");
    await expect(putPresignedFile("https://real-uploads.example/object", {} as File, vi.fn())).rejects.toMatchObject({ status: 403 });
    expect(xhr).not.toHaveBeenCalled();
    const socketFactory = vi.fn();
    const { createRoommateRealtimeClient } = await import("../lib/roommate-realtime");
    const client = createRoommateRealtimeClient({ token: "stale-token", onEvent: vi.fn(), onReconnect: vi.fn(), socketFactory });
    client.connect(); client.disconnect();
    expect(socketFactory).not.toHaveBeenCalled();
  });
});
