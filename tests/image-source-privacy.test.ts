import { describe, expect, it } from "vitest";
import { isTrustedImageSource } from "../lib/image-source";
import { buildContentSecurityPolicy } from "../lib/content-security-policy";

describe("image source privacy", () => {
  it.each(["https://tracker.example/avatar.png", "//tracker.example/pixel", "/\\tracker.example/pixel", "https://images.unsplash.com.evil.example/pixel", "https://person:secret@api.example/image", "javascript:alert(1)", "data:image/svg+xml,<svg/>"])("rejects untrusted image %s", source => {
    expect(isTrustedImageSource(source, "https://api.example/api/v1")).toBe(false);
  });
  it.each(["/brand/psw.svg", "https://api.example/api/v1/listing-media/1/content", "https://images.unsplash.com/photo-1?w=100", "data:image/png;base64,aGVsbG8="])("preserves approved image %s", source => {
    expect(isTrustedImageSource(source, "https://api.example/api/v1")).toBe(true);
  });
  it("limits the production browser policy to the API, basemap and approved photo service", () => {
    const policy = buildContentSecurityPolicy("nonce", "https://api.example/api/v1", "https://uploads.example");
    const rule = policy.split(";").find(value => value.trim().startsWith("img-src"))!;
    expect(rule).toContain("https://api.example");
    expect(rule).toContain("https://images.unsplash.com");
    expect(rule.split(/\s+/)).not.toContain("https:");
    expect(rule).not.toContain("https://uploads.example");
  });
});
