import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";

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
});

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}
