import { Inject, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { isEmail } from "class-validator";
import { createRemoteJWKSet, customFetch, errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { normalizeEmail } from "./code-security";
import { MAX_BEARER_TOKEN_LENGTH } from "./authenticated-user.service";
import { NEON_AUTH_CONFIG } from "./auth.tokens";
import type { NeonAuthConfig } from "./auth-provider";

export type NeonVerifiedIdentity = { issuer: string; subject: string; email: string; name: string | null; expiresAt: number };
export const NEON_JWKS_TIMEOUT_MS = 2_000;
export const NEON_JWKS_MAX_BYTES = 131_072;

/** A bounded public-key download from one operator-configured provider project. */
export function neonRemoteKeySet(config: NeonAuthConfig, fetchImpl: typeof fetch = fetch): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(config.jwksUrl), {
    timeoutDuration: NEON_JWKS_TIMEOUT_MS, cooldownDuration: 30_000, cacheMaxAge: 600_000,
    [customFetch]: async (url, options) => {
      if (url !== config.jwksUrl) throw new Error("Identity key endpoint changed");
      const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(NEON_JWKS_TIMEOUT_MS) });
      if (response.status !== 200) throw new Error("Identity key service unavailable");
      const declared = Number(response.headers.get("Content-Length"));
      if (Number.isFinite(declared) && declared > NEON_JWKS_MAX_BYTES) { await response.body?.cancel(); throw new Error("Identity key response too large"); }
      if (!response.body) throw new Error("Identity key response unavailable");
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          total += chunk.value.byteLength;
          if (total > NEON_JWKS_MAX_BYTES) throw new Error("Identity key response too large");
          chunks.push(chunk.value);
        }
      } catch (error) { await reader.cancel().catch(() => undefined); throw error; }
      finally { reader.releaseLock(); }
      const raw = Buffer.concat(chunks);
      const parsed: unknown = JSON.parse(raw.toString("utf8"));
      if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { keys?: unknown }).keys)) throw new Error("Invalid identity public keys");
      const keys = (parsed as { keys: unknown[] }).keys;
      if (!keys.length || keys.length > 10 || keys.some((entry) => {
        if (!entry || typeof entry !== "object") return true;
        const key = entry as Record<string, unknown>;
        return key.kty !== "OKP" || key.crv !== "Ed25519" || (key.alg !== undefined && key.alg !== "EdDSA") ||
          (key.use !== undefined && key.use !== "sig") || typeof key.kid !== "string" || !key.kid || key.kid.length > 128 ||
          typeof key.x !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(key.x) || key.d !== undefined;
      })) throw new Error("Invalid identity public keys");
      return new Response(raw, { status: 200, headers: { "Content-Type": "application/json" } });
    }
  });
}

@Injectable()
export class NeonTokenVerifier {
  private readonly keys?: JWTVerifyGetKey;
  constructor(@Inject(NEON_AUTH_CONFIG) private readonly config: NeonAuthConfig | undefined) {
    if (config) this.keys = neonRemoteKeySet(config);
  }

  async verify(token: string): Promise<NeonVerifiedIdentity> {
    if (!this.config || !this.keys) throw new ServiceUnavailableException({ code: "IDENTITY_PROVIDER_UNAVAILABLE", message: "External sign-in is not enabled" });
    if (typeof token !== "string" || !token || token.length > MAX_BEARER_TOKEN_LENGTH) throw new UnauthorizedException("Invalid identity token");
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.keys, {
        algorithms: ["EdDSA"], issuer: this.config.issuer, audience: this.config.audience,
        requiredClaims: ["sub", "iat", "exp", "iss", "aud"], maxTokenAge: "15m", clockTolerance: 5
      });
      const current = Math.floor(Date.now() / 1000);
      if (payload.aud !== this.config.audience || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp) || payload.iat! > current + 5 ||
          payload.exp! <= current || payload.exp! <= payload.iat! || payload.exp! - payload.iat! > 900 ||
          typeof protectedHeader.kid !== "string" || !protectedHeader.kid || protectedHeader.kid.length > 128 ||
          typeof payload.sub !== "string" || !/^[a-zA-Z0-9_-]{1,191}$/.test(payload.sub) ||
          (payload.id !== undefined && payload.id !== payload.sub) || payload.emailVerified !== true ||
          (payload.banned !== undefined && payload.banned !== false) ||
          typeof payload.email !== "string" || payload.email.length > 254 || payload.email !== payload.email.trim() || !isEmail(payload.email)) {
        throw new UnauthorizedException("Invalid identity token");
      }
      const name = typeof payload.name === "string" && payload.name.trim().length <= 140 && !/[\u0000-\u001f\u007f]/.test(payload.name) ? payload.name.trim() : null;
      return { issuer: this.config.issuer, subject: payload.sub, email: normalizeEmail(payload.email), name, expiresAt: payload.exp! * 1000 };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      if (error instanceof errors.JWTClaimValidationFailed || error instanceof errors.JWTExpired ||
          error instanceof errors.JWSSignatureVerificationFailed || error instanceof errors.JWSInvalid ||
          error instanceof errors.JWTInvalid || error instanceof errors.JOSEAlgNotAllowed || error instanceof errors.JWKSNoMatchingKey || error instanceof errors.JOSENotSupported) {
        throw new UnauthorizedException("Invalid identity token");
      }
      throw new ServiceUnavailableException({ code: "IDENTITY_PROVIDER_UNAVAILABLE", message: "External sign-in is temporarily unavailable" });
    }
  }
}
