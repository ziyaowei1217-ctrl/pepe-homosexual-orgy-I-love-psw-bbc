import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { getAuthProvider, getNeonAuthConfig, type NeonAuthConfig } from "../src/auth/auth-provider";
import { NeonTokenVerifier, NEON_JWKS_MAX_BYTES } from "../src/auth/neon-token-verifier";

const environment = { AUTH_PROVIDER: "neon", NEON_AUTH_BASE_URL: "https://ep-test-identity.neonauth.us-east-2.aws.neon.tech/neondb/auth", PUBLIC_BETA_SIGNUP: "true" };
const config = getNeonAuthConfig(environment)!;
let pair: Awaited<ReturnType<typeof generateKeyPair>>;
let publicJwk: Record<string, unknown>;
beforeAll(async () => {
  pair = await generateKeyPair("EdDSA", { crv: "Ed25519", extractable: true });
  publicJwk = { ...await exportJWK(pair.publicKey), kid: "key-1", alg: "EdDSA", use: "sig" };
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function verifier() {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return { service: new NeonTokenVerifier(config), fetch };
}
async function token(overrides: Record<string, unknown> = {}, key = pair.privateKey, header: Record<string, unknown> = {}) {
  const current = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: "subject-1", id: "subject-1", email: "person@example.test", emailVerified: true, banned: false, iat: current, exp: current + 900, iss: config.issuer, aud: config.audience, ...overrides })
    .setProtectedHeader({ alg: "EdDSA", kid: "key-1", ...header }).sign(key);
}

describe("trusted Neon provider configuration", () => {
  it("keeps email/invites as the default and opens beta sign-up only explicitly", () => {
    expect(getAuthProvider({})).toBe("email"); expect(getNeonAuthConfig({})).toBeUndefined();
    expect(getNeonAuthConfig({ ...environment, PUBLIC_BETA_SIGNUP: undefined })?.publicSignup).toBe(false);
    expect(getNeonAuthConfig(environment)?.publicSignup).toBe(true);
    expect(() => getNeonAuthConfig({ PUBLIC_BETA_SIGNUP: "true" })).toThrow("AUTH_PROVIDER");
    expect(() => getNeonAuthConfig({ ...environment, PUBLIC_BETA_SIGNUP: "yes" })).toThrow("PUBLIC_BETA_SIGNUP");
    expect(() => getAuthProvider({ AUTH_PROVIDER: "client-supplied" })).toThrow("AUTH_PROVIDER");
  });
  it.each(["http://ep-test.neonauth.us-east-2.aws.neon.tech/neondb/auth", "https://localhost/neondb/auth", "https://127.0.0.1/neondb/auth", "https://ep-test.neonauth.us-east-2.aws.neon.tech.evil.test/neondb/auth", "https://user:password@ep-test.neonauth.us-east-2.aws.neon.tech/neondb/auth", `${environment.NEON_AUTH_BASE_URL}?override=1`, `${environment.NEON_AUTH_BASE_URL}#fragment`, `${environment.NEON_AUTH_BASE_URL}/callback/google`])("rejects an untrusted or ambiguous provider URL: %s", value => {
    expect(() => getNeonAuthConfig({ ...environment, NEON_AUTH_BASE_URL: value })).toThrow("NEON_AUTH_BASE_URL");
  });
  it("accepts the observed managed cluster host and rejects deceptive cluster labels", () => {
    const base = "https://ep-red-shadow-b4rrx7ym.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth";
    expect(getNeonAuthConfig({ ...environment, NEON_AUTH_BASE_URL: base })?.baseUrl).toBe(base);
    for (const bad of [base.replace("c-6", "c-evil"), base.replace("c-6", "c-1234"), base.replace("c-6", "c-6.extra"), base.replace("neon.tech", "neon.tech.evil.test")]) {
      expect(() => getNeonAuthConfig({ ...environment, NEON_AUTH_BASE_URL: bad })).toThrow("NEON_AUTH_BASE_URL");
    }
  });
  it("pins issuer/audience to the project origin and JWKS to its base path", () => {
    expect(config).toMatchObject({ issuer: new URL(environment.NEON_AUTH_BASE_URL).origin, audience: new URL(environment.NEON_AUTH_BASE_URL).origin, jwksUrl: `${environment.NEON_AUTH_BASE_URL}/.well-known/jwks.json` });
    expect(() => getNeonAuthConfig({ ...environment, NEON_AUTH_JWKS_URL: "https://evil.test/keys" })).toThrow("NEON_AUTH_JWKS_URL");
  });
});

describe("Neon JWT verification", () => {
  it("verifies Ed25519 signatures and caches only the configured project's public keys", async () => {
    const { service, fetch } = verifier();
    const signed = await token({ role: "ADMIN", adminReauthenticatedAt: Math.floor(Date.now() / 1000) }, pair.privateKey, { jku: "https://evil.test/keys" });
    const identity = await service.verify(signed);
    await expect(service.verify(signed)).resolves.toEqual(identity);
    expect(identity).toMatchObject({ issuer: config.issuer, subject: "subject-1", email: "person@example.test" });
    expect(identity).not.toHaveProperty("role"); expect(identity).not.toHaveProperty("adminReauthenticatedAt");
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe(config.jwksUrl);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: "error" });
  });
  it("rejects a forged signature without touching another project's key endpoint", async () => {
    const { service, fetch } = verifier(); const attacker = await generateKeyPair("EdDSA");
    await expect(service.verify(await token({}, attacker.privateKey))).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(config.jwksUrl, expect.any(Object));
  });
  it.each([
    { iss: "https://other-project.neon.tech" }, { aud: "https://other-project.neon.tech" }, { aud: [config.audience, "https://other-project.neon.tech"] },
    { emailVerified: false }, { emailVerified: "true" }, { banned: true }, { banned: "false" },
    { sub: "other-subject", id: "subject-1" }, { sub: "" }, { email: "bad\n@example.test" },
    { email: " person@example.test " }, { iat: Math.floor(Date.now() / 1000) + 60 },
    { exp: Math.floor(Date.now() / 1000) - 1 }, { exp: Math.floor(Date.now() / 1000) + 3600 },
    { iat: undefined }, { exp: undefined }
  ])("rejects invalid or unverified identity claims: %j", async claims => {
    const { service } = verifier(); await expect(service.verify(await token(claims))).rejects.toMatchObject({ status: 401 });
  });
  it("rejects HMAC tokens, malformed and oversized input before public-key fetch", async () => {
    const { service, fetch } = verifier();
    const hmac = await new SignJWT({ sub: "subject-1" }).setProtectedHeader({ alg: "HS256", kid: "key-1" }).sign(new TextEncoder().encode("attacker-secret-32-characters-long"));
    for (const value of [hmac, "malformed", "a".repeat(8193)]) await expect(service.verify(value)).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed with sanitized errors for unavailable, oversized or private JWKS responses", async () => {
    for (const response of [new Response("provider-secret", { status: 503 }), new Response("x".repeat(NEON_JWKS_MAX_BYTES + 1)), new Response(JSON.stringify({ keys: [{ ...publicJwk, d: "private-material" }] }))]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      const service = new NeonTokenVerifier(config);
      try { await service.verify(await token()); throw new Error("Expected rejection"); }
      catch (error) { expect(error).toMatchObject({ status: 503 }); expect(String(error)).not.toContain("provider-secret"); expect(String(error)).not.toContain("private-material"); }
    }
  });
  it("does not expose or initialize external sign-in in the default email configuration", async () => {
    await expect(new NeonTokenVerifier(undefined as NeonAuthConfig | undefined).verify("anything")).rejects.toMatchObject({ status: 503 });
  });
});
