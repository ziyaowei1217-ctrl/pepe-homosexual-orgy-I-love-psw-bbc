import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, isHttpLoopbackRequest } from "../lib/content-security-policy";

describe("document CSP", () => {
  it("restricts scripts to the request nonce and explicitly allows API, sockets, uploads", () => {
    const csp = buildContentSecurityPolicy("random-nonce", "https://api.example.org/api/v1", "https://uploads.example.org/path");
    const scripts = csp.split(";").find((rule) => rule.trim().startsWith("script-src"));
    expect(scripts).toContain("'nonce-random-nonce'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("connect-src 'self' https://api.example.org wss://api.example.org https://uploads.example.org");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
  });
  it("does not inject directives from malformed endpoint configuration", () => {
    const csp = buildContentSecurityPolicy("nonce", "javascript:alert(1)", "https://uploads.example.org/path; script-src *");
    expect(csp).not.toContain("javascript:");
    expect(csp).not.toContain("script-src *");
  });
  it("keeps local HTTP previews usable without loosening script protection", () => {
    const local = buildContentSecurityPolicy("nonce", "http://localhost:4000/api/v1", undefined, false);
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(local).toContain("script-src 'self' 'nonce-nonce' 'strict-dynamic'");
    expect(buildContentSecurityPolicy("nonce", "https://api.example.org")).toContain("upgrade-insecure-requests");
  });
  it.each(["localhost", "LOCALHOST:4301", "127.0.0.1:3000", "[::1]", "[::1]:4301"])(
    "recognizes the browser's loopback authority %s independently of the server bind address",
    (authority) => expect(isHttpLoopbackRequest("http:", authority)).toBe(true)
  );
  it.each([
    null, "0.0.0.0:4301", "example.org", "localhost.example.org", "192.168.1.10:4301",
    "localhost@evil.example", "localhost/", "localhost?x=1", "localhost#x", "localhost\\evil.example",
    " localhost", "localhost:65536", "localhost:", "127.1", "localhost:80,example.org"
  ])("retains HTTPS upgrading for public or invalid authorities %s", (authority) => {
    expect(isHttpLoopbackRequest("http:", authority)).toBe(false);
  });
  it("retains HTTPS upgrading for HTTPS loopback requests", () => {
    expect(isHttpLoopbackRequest("https:", "localhost:4301")).toBe(false);
  });
});
