import type { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import type { AuthenticatedRequest } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { OptionalAuthGuard } from "../src/auth/optional-auth.guard";

const jwt = new JwtService({ secret: "test-secret" });

function guardFor(role: string | null) {
  return new OptionalAuthGuard(new AuthenticatedUserService(jwt, {
    user: { findUnique: async () => (role ? { id: "user-1", email: "user@example.test", role } : null) }
  } as never));
}

async function userAfter(guard: OptionalAuthGuard, authorization?: string) {
  const request: Partial<AuthenticatedRequest> & { headers: { authorization?: string } } = { headers: { authorization } };
  const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  await expect(guard.canActivate(context)).resolves.toBe(true);
  return request.user;
}

describe("OptionalAuthGuard", () => {
  it("attaches the current user for a valid session and lets everything else through as a guest", async () => {
    const token = await jwt.signAsync({ sub: "user-1", role: "USER" }, { expiresIn: 7 * 24 * 3600 });
    expect(await userAfter(guardFor("USER"), `Bearer ${token}`)).toEqual({ id: "user-1", email: "user@example.test", role: "USER" });
    expect(await userAfter(guardFor("USER"))).toBeUndefined();
    expect(await userAfter(guardFor("USER"), "Bearer not-a-jwt")).toBeUndefined();
    expect(await userAfter(guardFor(null), `Bearer ${token}`)).toBeUndefined();
  });

  it("applies the one-hour administrator session like AuthGuard does", async () => {
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 3600;
    const token = await jwt.signAsync({ sub: "user-1", role: "USER", iat: twoHoursAgo }, { expiresIn: 7 * 24 * 3600 });
    expect(await userAfter(guardFor("USER"), `Bearer ${token}`)).toMatchObject({ id: "user-1", role: "USER" });
    // The same week-long renter token is no longer a session once the account is an administrator.
    expect(await userAfter(guardFor("ADMIN"), `Bearer ${token}`)).toBeUndefined();
  });
});
