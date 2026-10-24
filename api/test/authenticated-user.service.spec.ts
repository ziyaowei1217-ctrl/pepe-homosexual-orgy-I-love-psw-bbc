import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it, vi } from "vitest";

import { AuthenticatedUserService, MAX_BEARER_TOKEN_LENGTH } from "../src/auth/authenticated-user.service";

describe("AuthenticatedUserService", () => {
  it("reloads the current database user from a valid bearer token", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "user-1", email: "stale@example.test", role: "ADMIN" });
    const service = new AuthenticatedUserService(jwt, {
      user: {
        findUnique: async () => ({ id: "user-1", email: "current@example.test", role: "USER" })
      }
    } as never);

    await expect(service.fromBearerToken(token)).resolves.toEqual({
      id: "user-1",
      email: "current@example.test",
      role: "USER"
    });
  });

  it("rejects an invalid token with the existing HTTP error", async () => {
    const service = new AuthenticatedUserService(new JwtService({ secret: "test-secret" }), {
      user: { findUnique: async () => null }
    } as never);

    const rejection = await rejectionOf(service.fromBearerToken("not-a-jwt"));

    expect(rejection).toBeInstanceOf(UnauthorizedException);
    expect((rejection as UnauthorizedException).message).toBe("Invalid bearer token");
  });

  it.each([undefined, "", 42, { id: "user-1" }])("rejects an invalid signed token subject: %j", async (sub) => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub });
    const service = new AuthenticatedUserService(jwt, {
      user: { findUnique: async () => { throw new Error("Invalid subjects must not reach the database"); } }
    } as never);

    await expect(service.fromBearerToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects another HMAC algorithm and expired or over-age signed sessions before database access", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const findUnique = vi.fn();
    const service = new AuthenticatedUserService(jwt, { user: { findUnique } } as never);
    const now = Math.floor(Date.now() / 1000);
    const tokens = [
      await jwt.signAsync({ sub: "user-1" }, { algorithm: "HS512" }),
      await jwt.signAsync({ sub: "user-1", exp: now - 1 }),
      await jwt.signAsync({ sub: "user-1", iat: now - 8 * 24 * 60 * 60 }),
      await jwt.signAsync({ sub: "user-1", iat: now + 120 })
    ];
    for (const token of tokens) await expect(service.fromBearerToken(token)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("bounds token input before invoking verification", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const verify = vi.spyOn(jwt, "verifyAsync");
    const service = new AuthenticatedUserService(jwt, { user: { findUnique: vi.fn() } } as never);
    await expect(service.fromBearerToken("a".repeat(MAX_BEARER_TOKEN_LENGTH + 1))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verify).not.toHaveBeenCalled();
  });

  it("returns the earlier of the signed expiry and maximum session age for socket lifecycle", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const iat = Math.floor(Date.now() / 1000);
    const service = new AuthenticatedUserService(jwt, {
      user: { findUnique: async () => ({ id: "user-1", email: "current@example.test", role: "USER" }) }
    } as never);
    const token = await jwt.signAsync({ sub: "user-1", iat, exp: iat + 60 });
    await expect(service.fromBearerTokenWithExpiry(token)).resolves.toMatchObject({ expiresAt: (iat + 60) * 1000 });
  });
});

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}
