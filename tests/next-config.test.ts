import { readFileSync, readdirSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error Next.js loads its JavaScript configuration directly.
import rawNextConfig from "../next.config.mjs";

const nextConfig = rawNextConfig as {
  output?: string;
  headers?: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>>;
};

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe("production web configuration", () => {
  it("builds a portable server and applies browser security headers", async () => {
    expect(nextConfig.output).toBe("standalone");
    const headers = await nextConfig.headers?.();
    const values = headers?.flatMap((entry) => entry.headers) ?? [];
    const csp = values.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    expect(csp).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(values).toContainEqual(expect.objectContaining({ key: "X-Content-Type-Options", value: "nosniff" }));
  });

  it("ships the self-hosted psw fonts with the standalone server", () => {
    // The standalone output leaves public/ behind, so the image must copy it or every font request 404s.
    expect(readFileSync("Dockerfile.web", "utf8")).toContain("COPY --from=build /app/public ./public");
    const css = readFileSync("app/psw-fonts.css", "utf8");
    const files = readdirSync("public/fonts/psw");
    for (const [, file] of css.matchAll(/url\("\/fonts\/psw\/([^"]+)"\)/g)) expect(files).toContain(file);
  });

  it("allows direct development images from the public API without exposing its internal address", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:4100/api/v1");
    vi.stubEnv("API_INTERNAL_BASE_URL", "http://private-api:4000/api/v1");
    vi.resetModules();
    // @ts-expect-error Next.js loads its JavaScript configuration directly.
    const { default: config } = await import("../next.config.mjs");
    const headers = await config.headers();
    const csp = headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
    const imageRule = csp.split(";").find((rule: string) => rule.trim().startsWith("img-src"));
    expect(config.images.unoptimized).toBe(true);
    expect(imageRule).toContain("http://localhost:4100");
    expect(csp).not.toContain("private-api");
  });

  it("uses per-request production CSP and never turns the image optimizer into an API proxy", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example/api/v1");
    vi.resetModules();
    // @ts-expect-error Next.js loads its JavaScript configuration directly.
    const { default: config } = await import("../next.config.mjs");
    const headers = await config.headers();
    expect(headers.flatMap((entry: { headers: Array<{ key: string }> }) => entry.headers).some((header: { key: string }) => header.key === "Content-Security-Policy")).toBe(false);
    expect(config.poweredByHeader).toBe(false);
    expect(config.images.minimumCacheTTL).toBe(0);
    expect(config.images.localPatterns).toEqual([]);
    expect(config.images.remotePatterns).toEqual([{ protocol: "https", hostname: "images.unsplash.com" }]);
  });

  it("never exposes configured backend origins in development demo connection rules", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_WEBSITE_DEMO", "true");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://private-api.example/api/v1");
    vi.stubEnv("NEXT_PUBLIC_MAP_STYLE_URL", "https://unapproved-map.example/style.json");
    vi.resetModules();
    // @ts-expect-error Next.js loads its JavaScript configuration directly.
    const { default: config } = await import("../next.config.mjs");
    const headers = await config.headers();
    const csp = headers[0].headers.find((header: { key: string }) => header.key === "Content-Security-Policy").value;
    expect(csp).toContain("connect-src 'self' https://tiles.openfreemap.org");
    expect(csp).not.toMatch(/private-api|unapproved-map/);
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("img-src 'self' data: blob: https://images.unsplash.com https://tiles.openfreemap.org;");
  });
});
