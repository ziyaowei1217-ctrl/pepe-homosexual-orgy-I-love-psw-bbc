import { readFileSync } from "node:fs";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildContentSecurityPolicy, isHttpLoopbackRequest, mapConnectionOrigins } from "../lib/content-security-policy";
import { canonicalWebsitePath, isCanonicalWebsiteStaticPath } from "../lib/website-static-path";
import { middleware } from "../middleware";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });

function useDemo(environment = "production") {
  vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
  vi.stubEnv("NODE_ENV", environment);
}

describe("functional website demo delivery boundary", () => {
  it.each(["/account", "/account/profile", "/inbox", "/trips", "/host", "/applications/new", "/roommates/teams", "/listing/mine", "/saved", "/search"])(
    "opens the existing %s screen without a disabled-notice rewrite",
    (path) => {
      useDemo();
      const response = middleware(new NextRequest(`https://demo.example${path}?returnTo=%2Fsaved`));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    }
  );

  it.each(["POST", "PATCH", "PUT", "DELETE", "OPTIONS"])("rejects server %s before assets, API and page handling", async (method) => {
    useDemo();
    for (const path of ["/", "/_next/static/chunks/main.js", "/api/health", "/api/assistant/chat", "/account"]) {
      const response = middleware(new NextRequest(`https://demo.example${path}`, { method }));
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ code: "WEBSITE_DEMO_LOCAL_ONLY" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  });

  it.each(["/api", "/api/v1/auth/me", "/api/assistant", "/api/assistant/chat", "/%61pi/health", "/api%2fhealth"])(
    "does not expose real backend or provider reads at %s",
    (path) => {
      useDemo();
      expect(middleware(new NextRequest(`https://demo.example${path}`)).status).toBe(403);
    }
  );

  it("preserves exact local health GET and HEAD", () => {
    useDemo();
    for (const method of ["GET", "HEAD"]) {
      const response = middleware(new NextRequest("https://demo.example/api/health", { method }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    }
  });

  it("overwrites forged nonce headers and uses a distinct nonce for every document", () => {
    useDemo();
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://private-api.example/api/v1");
    vi.stubEnv("NEXT_PUBLIC_MEDIA_UPLOAD_ORIGIN", "https://private-upload.example");
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "https://unapproved-map.example/style.json");
    const request = () => new NextRequest("https://demo.example/", {
      headers: { "x-nonce": "forged", "Content-Security-Policy": "script-src *" }
    });
    const first = middleware(request());
    const policy = first.headers.get("Content-Security-Policy")!;
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("connect-src 'self' https://tiles.openfreemap.org;");
    const images = policy.split(";").find(rule => rule.trim().startsWith("img-src"))!;
    expect(images.trim()).toBe("img-src 'self' data: blob: https://images.unsplash.com https://tiles.openfreemap.org");
    expect(images.split(/\s+/)).not.toContain("https:");
    expect(policy).not.toMatch(/private-api|private-upload|unapproved-map|forged|unsafe-eval/);
    expect(policy.split(";").find(rule => rule.trim().startsWith("script-src"))).not.toContain("unsafe-inline");
    expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    const nonce = first.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    expect(policy).toContain(`'nonce-${nonce}'`);
    expect(middleware(request()).headers.get("Content-Security-Policy")).not.toBe(policy);
  });

  it("keeps all guards in development, without enforcing a production-only nonce", () => {
    useDemo("development");
    expect(middleware(new NextRequest("http://localhost:3000/api/assistant")).status).toBe(403);
    expect(middleware(new NextRequest("http://localhost:3000/account")).headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps ordinary production backend methods and endpoints working outside the explicit demo", () => {
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "");
    vi.stubEnv("NODE_ENV", "production");
    for (const path of ["/api/assistant/chat", "/account"]) {
      const response = middleware(new NextRequest(`https://app.example${path}`, { method: "POST" }));
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("X-Robots-Tag")).toBeNull();
    }
    expect(middleware(new NextRequest("https://app.example/")).headers.get("Content-Security-Policy")).toContain("'strict-dynamic'");
  });

  it("requires connected Netlify endpoints and keeps the expected public basemap", () => {
    const config = readFileSync("netlify.toml", "utf8");
    expect(config).toContain('node tools/netlify-build-config.mjs');
    expect(config).not.toMatch(/NEXT_PUBLIC_WEBSITE_DEMO\s*=|demo\.invalid/);
    expect(config).toContain('NEXT_PUBLIC_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty"');
    expect(config).toContain('NODE_VERSION = "22"');
    expect(config).toContain('PNPM_VERSION = "9.15.4"');
    // The CDN serves public worker assets without calling Next's headers().
    const workerHeaders = config.split('for = "/vendor/maplibre/*"')[1];
    expect(workerHeaders).toContain("script-src 'self'; connect-src 'self' https://tiles.openfreemap.org; worker-src 'none'");
    expect(workerHeaders).toContain('Cache-Control = "public, max-age=31536000, immutable"');
    expect(workerHeaders).not.toContain("unsafe-eval");
  });
});

describe("path and asset dispatch", () => {
  it.each(["/%", "/account%252fprofile", "/_next/static%2f..%2fapi/secret", "/account//profile", "/account%5cprofile", "/account%00", "/account%3femail=x"])("rejects ambiguous path %s", path => {
    useDemo();
    expect(middleware(new NextRequest(`https://demo.example${path}`)).status).toBe(400);
  });

  it.each(["/_next/static/chunks/app.js", "/_next/image", "/fonts/psw/rounded-bold-core.woff2", "/fonts/psw/rounded-bold-16.woff2", "/fonts/psw/slogan-heavy.woff2", "/vendor/maplibre/6.4.1/maplibre-gl-worker.mjs", "/vendor/maplibre/6.4.1/maplibre-gl-shared.mjs"])("serves inert assets %s without document nonce caching", path => {
    useDemo();
    const response = middleware(new NextRequest(`https://demo.example${path}`));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
  });

  it.each(["/fonts/psw/.env", "/fonts/psw/rounded-bold-core.woff2/secret", "/_next/static%2fapi.js", "/fonts/psw/rounded-bold-99.woff2", "/vendor/maplibre/6.4.1/.env", "/vendor/maplibre/6.4.1/maplibre-gl-worker.mjs/secret", "/vendor/maplibre/6.4.1/unknown.mjs", "/vendor/maplibre%2f6.4.1/maplibre-gl-worker.mjs"])("never grants asset handling to %s", path => {
    expect(isCanonicalWebsiteStaticPath(path)).toBe(false);
  });

  it("canonicalizes a single unambiguous encoded path without permitting double-decoding", () => {
    expect(canonicalWebsitePath("/account/%70rofile")).toBe("/account/profile");
    expect(canonicalWebsitePath("/account/%2570rofile")).toBeNull();
  });
});

describe("production policy compatibility", () => {
  it("allows only configured normal-production map/API/upload connections with nonce scripts", () => {
    const policy = buildContentSecurityPolicy("test-nonce", "https://api.example/api/v1", "https://uploads.example", true, ["https://maps.example/style.json"]);
    expect(policy).toContain("connect-src 'self' https://api.example wss://api.example https://uploads.example https://maps.example");
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("does not inject credentials, directives or non-HTTP schemes through endpoint configuration", () => {
    const policy = buildContentSecurityPolicy("nonce", "javascript:alert(1)", "https://user:secret@uploads.example", true, ["data:script-src *", "https://maps.example/path; script-src *"]);
    expect(policy).not.toMatch(/javascript|secret|script-src \*/);
    expect(policy).toContain("connect-src 'self' https://maps.example");
    expect(mapConnectionOrigins()).toEqual(["https://tiles.openfreemap.org"]);
    expect(mapConnectionOrigins("https://custom-map.example/style.json", "https://tiles.example/{z}/{x}/{y}.png")).toEqual(["https://custom-map.example", "https://tiles.example"]);
  });

  it("blocks arbitrary external avatar hosts through the demo image policy", () => {
    const policy = buildContentSecurityPolicy("nonce", "", undefined, true, [], true);
    const imageSources = policy.split(";").find(rule => rule.trim().startsWith("img-src"))!.trim().split(/\s+/).slice(1);
    expect(imageSources).toEqual(["'self'", "data:", "blob:", "https://images.unsplash.com", "https://tiles.openfreemap.org"]);
    expect(imageSources).not.toContain("https:");
    expect(imageSources).not.toContain("*");
    expect(imageSources).not.toContain("https://untrusted-avatar.example");
  });

  it.each(["localhost", "LOCALHOST:4301", "127.0.0.1:3000", "[::1]:4301"])("allows a local HTTP preview at %s without upgrading local assets", authority => {
    expect(isHttpLoopbackRequest("http:", authority)).toBe(true);
    expect(buildContentSecurityPolicy("nonce", "", undefined, false)).not.toContain("upgrade-insecure-requests");
  });

  it.each([null, "0.0.0.0:4301", "localhost.example", "localhost:65536", "localhost@evil.example", "localhost:80,example.org"])("keeps HTTPS upgrade protection for %s", authority => {
    expect(isHttpLoopbackRequest("http:", authority)).toBe(false);
  });
});
