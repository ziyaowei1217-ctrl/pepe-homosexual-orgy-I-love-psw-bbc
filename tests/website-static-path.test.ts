import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { config, middleware } from "../middleware";
import { isCanonicalWebsiteStaticPath } from "../lib/website-static-path";
import { canBrowseWebsiteDemo } from "../lib/website-demo";

const require = createRequire(import.meta.url);
const { getMiddlewareMatchers } = require("next/dist/build/analysis/get-page-static-info") as {
  getMiddlewareMatchers: (matcher: string[], nextConfig: object) => Array<{ regexp: string }>;
};
const matchesRawPath = (matcher: string[], path: string) =>
  getMiddlewareMatchers(matcher, {}).some(item => new RegExp(item.regexp).test(path));

function rawPathRequest(path: string) {
  const request = new NextRequest("https://demo.example/");
  const nextUrl = request.nextUrl;
  // Model the host's pre-normalization pathname independently of WHATWG URL.
  Object.defineProperty(request, "nextUrl", { value: {
    pathname: path, protocol: nextUrl.protocol, clone: () => nextUrl.clone()
  } });
  return request;
}

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const dangerousAssetPaths = [
  "/_next/static/%2e%2e/%2e%2e/account", "/_next/static/%2E%2E/%2E%2E/account",
  "/icon.svg/%2e%2e/account", "/_next/image/%2e%2e/account",
  "/favicon.ico/%2e%2e/account", "/apple-icon.png/%2e%2e/account",
  "/_next/static/%252e%252e/%252e%252e/account", "/_next/static/%25252e%25252e/account",
  "/_next/static/../account", "/_next/static/chunks/./page.js",
  "/_next/static/chunks//page.js", "/_next/static/chunks/%2faccount",
  "/_next/static/chunks/%252faccount", "/_next/static/chunks/%5caccount",
  "/_next/static/chunks/%255caccount", "/_next/static/chunks/\\account",
  "/_next/static/chunks/%00page.js", "/_next/static/chunks/%2500page.js",
  "/_next/static/chunks/%0apage.js", "/_next/static/chunks/%7fpage.js",
  "/_next/static/chunks/%c2%80page.js", "/_next/static/chunks/%20page.js",
  "/_next/static/chunks/%3fpage.js", "/_next/static/chunks/%23page.js",
  "/_next/static/chunks/%", "/_next/static/chunks/%GGpage.js",
  "/_next/static-lookalike/page.js", "/_next/image-lookalike", "/icon.svg/private",
  "/brand/README.md", "/brand/psw-logo.svg.js", "/account", "/api/v1/auth/me"
];

describe("canonical framework asset boundary", () => {
  it.each([
    "/_next/static/css/styles.css", "/_next/static/chunks/app/account/page-123.js",
    "/_next/static/chunks/app/listing/%5BlistingId%5D/page-123.js",
    "/_next/static/build-id/_buildManifest.js", "/_next/static/media/font.woff2",
    "/_next/static/media/photo.avif", "/_next/image", "/favicon.ico", "/icon.svg", "/apple-icon.png",
    "/brand/psw-logo.svg", "/brand/psw-mark.svg", "/brand/psw-logo-white.svg", "/brand/psw-logo.png"
  ])("retains canonical static cache handling for %s", path => {
    expect(isCanonicalWebsiteStaticPath(path)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    for (const demo of ["", "true"]) {
      vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", demo);
      const result = middleware(new NextRequest(`https://demo.example${path}`));
      expect(result.headers.get("x-middleware-next")).toBe("1");
      expect(result.headers.get("x-middleware-rewrite")).toBeNull();
      expect(result.headers.get("Content-Security-Policy")).toBeNull();
      expect(result.headers.get("Cache-Control")).toBeNull();
      expect(result.headers.get("X-Robots-Tag")).toBe(demo ? "noindex, nofollow, noarchive" : null);
    }
  });

  it.each(dangerousAssetPaths)("selects raw dangerous paths for middleware and never marks them as static: %s", path => {
    // Compile Next's actual matcher and pass the raw path: NextRequest alone
    // normalizes encoded dot segments and would hide the host dispatch defect.
    expect(matchesRawPath(config.matcher, path)).toBe(true);
    expect(isCanonicalWebsiteStaticPath(path)).toBe(false);
  });

  it("regresses the exact old raw matcher hole independently of URL construction", () => {
    const old = ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"];
    const path = "/_next/static/%2e%2e/%2e%2e/account";
    expect(matchesRawPath(old, path)).toBe(false);
    expect(matchesRawPath(config.matcher, path)).toBe(true);
  });

  it.each(dangerousAssetPaths.filter(path => !path.startsWith("/api/")))("keeps unsafe asset routes inside demo page isolation: %s", path => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    const result = middleware(rawPathRequest(path));
    expect(result.headers.get("x-middleware-rewrite")).toBe("https://demo.example/demo");
    expect(result.headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
    expect(result.headers.get("Content-Security-Policy")).toMatch(/'nonce-[^']+'/);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("denies %s before canonical or encoded static handling", async method => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    for (const path of ["/_next/static/chunks/app/page.js", "/_next/image?url=%2Fapi%2Fv1%2Fprivate&w=640&q=75", "/icon.svg", "/_next/static/%2e%2e/%2e%2e/account", "/icon.svg/%2e%2e/api/health"]) {
      const result = middleware(new NextRequest(`https://demo.example${path}`, { method }));
      expect(result.status).toBe(403);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
      expect(await result.json()).toEqual({ code: "WEBSITE_DEMO_READ_ONLY" });
    }
  });

  it("denies host-normalized encoded API paths before any static bypass", async () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    for (const path of ["/_next/static/%2e%2e/%2e%2e/api/v1/auth/me", "/icon.svg/%2e%2e/api/v1/auth/me"]) {
      const result = middleware(new NextRequest(`https://demo.example${path}`));
      expect(result.status).toBe(403);
      expect(await result.json()).toEqual({ code: "WEBSITE_DEMO_READ_ONLY" });
    }
  });

  it("also guards a host-normalized private pathname while preserving canonicalized static assets", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    const page = middleware(new NextRequest("https://demo.example/_next/static/%2e%2e/%2e%2e/account"));
    expect(page.headers.get("x-middleware-rewrite")).toBe("https://demo.example/demo");
    expect(page.headers.get("Content-Security-Policy")).toMatch(/'nonce-[^']+'/);
    const asset = middleware(new NextRequest("https://demo.example/_next/static/chunks/./page.js"));
    expect(asset.headers.get("x-middleware-next")).toBe("1");
    expect(asset.headers.get("Content-Security-Policy")).toBeNull();
  });

  it("keeps normal API methods and document nonce handling when the demo is off", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(middleware(new NextRequest("https://web.example/api/v1/resource", { method: "PATCH" })).headers.get("x-middleware-next")).toBe("1");
    const page = middleware(new NextRequest("https://web.example/_next/static/%2e%2e/%2e%2e/account"));
    expect(page.headers.get("x-middleware-rewrite")).toBeNull();
    expect(page.headers.get("Content-Security-Policy")).toMatch(/'nonce-[^']+'/);
    expect(page.headers.get("Cache-Control")).toBe("private, no-store");
    expect(page.headers.get("X-Robots-Tag")).toBeNull();
  });

  it.each([
    "/listing/%252e%252e%252faccount", "/roommates/%256cikes", "/roommates/%2574eams",
    "/listing/%256dine", "/listing/../account", "/listing/%2e%2e", "/roommates/%2e",
    "/listing/id\\account", "/roommates/id%5caccount", "/listing/id%00", "/roommates/id%2500",
    "/listing/id%0a", "/roommates/id%7f", "/listing/id%20", "/listing/%", "/roommates/%GG"
  ])("rejects ambiguous public dynamic route %s before further host decoding", path => {
    expect(canBrowseWebsiteDemo(path)).toBe(false);
  });

  it.each(["/listing/00000000-0000-4000-8000-000000000001", "/listing/preview-listing-1", "/roommates/preview-roommate-1"])("retains ordinary public IDs: %s", path => {
    expect(canBrowseWebsiteDemo(path)).toBe(true);
  });

  it("preserves ordinary public queries and HEAD handling", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NODE_ENV", "production");
    const page = middleware(new NextRequest("https://demo.example/search?q=Ann%20Arbor&role=renter", { method: "HEAD" }));
    expect(page.headers.get("x-middleware-next")).toBe("1");
    expect(page.headers.get("x-middleware-rewrite")).toBeNull();
    expect(page.headers.get("Content-Security-Policy")).toContain("connect-src 'self';");
  });
});
