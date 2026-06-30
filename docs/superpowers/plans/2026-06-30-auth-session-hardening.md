# Auth Session Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make authenticated requests use the current database user and role instead of trusting stale JWT role claims.

**Architecture:** Keep `JwtService` responsible for token signature and expiration verification. Inject `PrismaService` into `AuthGuard`, load the current user by `payload.sub`, and attach the database identity to `request.user`. Update the in-memory Prisma mock used by HTTP tests to support `user.findUnique`.

**Tech Stack:** NestJS 10 guards, Prisma, JWT, Vitest, TypeScript, Supertest.

---

## File Structure

- Create `api/test/auth.guard.spec.ts`: direct AuthGuard tests for missing tokens, invalid tokens, missing users, current-user hydration, and stale role downgrades.
- Modify `api/src/auth/auth.guard.ts`: inject Prisma, require `sub`, load current user, and attach database user state to the request.
- Modify `api/test/support/launch-prisma-mock.ts`: add `user.findUnique({ where: { id } })` so HTTP e2e tests run with production-like guard behavior.

## Task 1: AuthGuard Tests

**Files:**
- Create: `api/test/auth.guard.spec.ts`

- [ ] **Step 1: Write failing AuthGuard tests**

Create `api/test/auth.guard.spec.ts`:

```ts
import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";

import { AuthenticatedRequest, AuthGuard } from "../src/auth/auth.guard";

describe("AuthGuard", () => {
  it("rejects missing bearer tokens", async () => {
    const guard = new AuthGuard(new JwtService({ secret: "test-secret" }), createPrismaMock() as never);

    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects invalid bearer tokens", async () => {
    const guard = new AuthGuard(new JwtService({ secret: "test-secret" }), createPrismaMock() as never);

    await expect(guard.canActivate(contextWithHeader("Bearer nope"))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects valid tokens when the user no longer exists", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "missing-user", email: "old@example.com", role: "ADMIN" });
    const guard = new AuthGuard(jwt, createPrismaMock() as never);

    await expect(guard.canActivate(contextWithHeader(`Bearer ${token}`))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("attaches the current database user to the request", async () => {
    const jwt = new JwtService({ secret: "test-secret" });
    const token = await jwt.signAsync({ sub: "user-1", email: "old@example.com", role: "ADMIN" });
    const prisma = createPrismaMock({
      users: [{ id: "user-1", email: "current@example.com", role: "USER" }]
    });
    const request = requestWithHeader(`Bearer ${token}`);
    const guard = new AuthGuard(jwt, prisma as never);

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
    const guard = new AuthGuard(jwt, prisma as never);

    await guard.canActivate(contextForRequest(request));

    expect(request.user.role).toBe("USER");
  });
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
```

- [ ] **Step 2: Run AuthGuard tests to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/auth.guard.spec.ts
```

Expected: tests fail because `AuthGuard` currently accepts only `JwtService` and trusts token payload `email` and `role`.

## Task 2: Guard Implementation

**Files:**
- Modify: `api/src/auth/auth.guard.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`

- [ ] **Step 1: Inject Prisma and hydrate current user**

Update `api/src/auth/auth.guard.ts`:

```ts
import { PrismaService } from "../prisma/prisma.service";
```

Constructor:

```ts
constructor(
  @Inject(JwtService) private readonly jwt: JwtService,
  @Inject(PrismaService) private readonly prisma: PrismaService
) {}
```

Guard behavior:

```ts
const payload = await this.jwt.verifyAsync<{ sub?: string }>(token);
if (!payload.sub) throw new UnauthorizedException("Invalid bearer token");

const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
if (!user) throw new UnauthorizedException("Invalid bearer token");

request.user = { id: user.id, email: user.email, role: user.role };
return true;
```

- [ ] **Step 2: Update launch Prisma mock for HTTP tests**

In `api/test/support/launch-prisma-mock.ts`, add `findUnique` to the `user` mock:

```ts
findUnique: async ({ where }: { where: { id: string } }) =>
  state.users.find((user) => user.id === where.id) ?? null,
```

- [ ] **Step 3: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/auth.guard.spec.ts test/http-launch-readiness.e2e.spec.ts test/listings-validation.e2e.spec.ts
```

Expected: AuthGuard unit tests and HTTP e2e tests pass.

## Task 3: Launch Verification

**Files:**
- No additional files beyond previous tasks.

- [ ] **Step 1: Run full launch check**

Run from `api`:

```bash
npm run launch:check
```

Expected: tests, typecheck, build, and Prisma validate pass.

- [ ] **Step 2: Run real-Postgres smoke**

Run from `api`:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: launch smoke test passes against Docker Postgres.

- [ ] **Step 3: Commit implementation**

Run from repository root:

```bash
git add api/src/auth/auth.guard.ts api/test/auth.guard.spec.ts api/test/support/launch-prisma-mock.ts docs/superpowers/plans/2026-06-30-auth-session-hardening.md
git commit -m "feat: hydrate auth guard users from database"
```
