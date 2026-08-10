import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { AuthenticatedRequest, AuthGuard } from "../src/auth/auth.guard";

describe("AuthGuard", () => {
  it("rejects missing bearer tokens", async () => {
    const guard = createGuard(new JwtService({ secret: "test-secret" }), createPrismaMock());

    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects invalid bearer tokens", async () => {
    const guard = createGuard(new JwtService({ secret: "test-secret" }), createPrismaMock());

    await expect(guard.canActivate(contextWithHeader("Bearer nope"))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects valid tokens when the user no longer exists", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "missing-user", email: "old@example.com", role: "ADMIN" });
    const guard = createGuard(jwt, createPrismaMock());

    await expect(guard.canActivate(contextWithHeader(`Bearer ${token}`))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("attaches the current database user to the request", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "user-1", email: "old@example.com", role: "ADMIN" });
    const prisma = createPrismaMock({
      users: [{ id: "user-1", email: "current@example.com", role: "USER" }]
    });
    const request = requestWithHeader(`Bearer ${token}`);
    const guard = createGuard(jwt, prisma);

    await expect(guard.canActivate(contextForRequest(request))).resolves.toBe(true);

    expect(request.user).toEqual({
      id: "user-1",
      email: "current@example.com",
      role: "USER"
    });
  });

  it("uses the current database role instead of a stale admin token role", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "user-1", email: "admin@example.com", role: "ADMIN" });
    const prisma = createPrismaMock({
      users: [{ id: "user-1", email: "admin@example.com", role: "USER" }]
    });
    const request = requestWithHeader(`Bearer ${token}`);
    const guard = createGuard(jwt, prisma);

    await guard.canActivate(contextForRequest(request));

    expect(request.user.role).toBe("USER");
  });

  it("copies a verified numeric administrator reauthentication timestamp", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "admin-1", adminReauthenticatedAt: 1_912_345_600 });
    const prisma = createPrismaMock({
      users: [{ id: "admin-1", email: "admin@example.com", role: "ADMIN" }]
    });
    const request = requestWithHeader(`Bearer ${token}`);
    const guard = createGuard(jwt, prisma);

    await guard.canActivate(contextForRequest(request));

    expect(request.user.adminReauthenticatedAt).toBe(1_912_345_600);
  });

  it.each(["1912345600", 1_912_345_600.5, Number.MAX_SAFE_INTEGER + 1])(
    "does not copy an unsafe administrator reauthentication timestamp: %s",
    async (adminReauthenticatedAt) => {
      const jwt = new JwtService({ secret: "test-secret" });
      const token = await jwt.signAsync({ sub: "admin-1", adminReauthenticatedAt });
      const prisma = createPrismaMock({
        users: [{ id: "admin-1", email: "admin@example.com", role: "ADMIN" }]
      });
      const request = requestWithHeader(`Bearer ${token}`);
      const guard = createGuard(jwt, prisma);

      await guard.canActivate(contextForRequest(request));

      expect(request.user).not.toHaveProperty("adminReauthenticatedAt");
    }
  );
});

type TestUser = {
  id: string;
  email: string;
  role: string;
};

function createPrismaMock({ users = [] }: { users?: TestUser[] } = {}) {
  return {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => users.find((user) => user.id === where.id) ?? null
    }
  };
}

function createGuard(jwt: JwtService, prisma: ReturnType<typeof createPrismaMock>) {
  return new AuthGuard(new AuthenticatedUserService(jwt, prisma as never));
}

function requestWithHeader(authorization?: string): AuthenticatedRequest {
  return {
    headers: {
      ...(authorization ? { authorization } : {})
    },
    user: undefined as never
  };
}

function contextWithHeader(authorization?: string): ExecutionContext {
  return contextForRequest(requestWithHeader(authorization));
}

function contextForRequest(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown as ExecutionContext;
}
