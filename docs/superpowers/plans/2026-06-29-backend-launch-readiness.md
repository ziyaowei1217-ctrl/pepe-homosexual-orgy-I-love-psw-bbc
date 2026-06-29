# Backend Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add health/readiness endpoints, HTTP launch-flow coverage, optional real-Postgres smoke coverage, and launch-check scripts for the existing API.

**Architecture:** Add a focused `HealthModule` that depends only on `PrismaService` for readiness. Use Nest TestingModule plus Supertest for HTTP e2e tests, overriding Prisma with an in-memory test double for normal test runs. Add an opt-in DB smoke spec that uses the real `AppModule` and cleans up only data it creates.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, Vitest, Supertest, TypeScript, npm scripts.

---

## File Structure

- Create `api/src/health/health.service.ts`: liveness and readiness checks.
- Create `api/src/health/health.controller.ts`: `GET /health` and `GET /ready`.
- Create `api/src/health/health.module.ts`: registers controller and service.
- Modify `api/src/app.module.ts`: import `HealthModule`.
- Create `api/test/health.controller.spec.ts`: unit tests for `HealthService` and controller behavior.
- Create `api/test/http-launch-readiness.e2e-spec.ts`: HTTP e2e test with in-memory Prisma.
- Create `api/test/support/launch-prisma-mock.ts`: shared in-memory Prisma test double.
- Create `api/test/launch-smoke.spec.ts`: optional real-Postgres smoke test skipped unless `RUN_DB_SMOKE=1`.
- Modify `api/package.json`: add `launch:check` and `launch:smoke` scripts.
- Modify `README.md`: document launch readiness checks.

## Task 1: Health And Readiness

**Files:**
- Create: `api/test/health.controller.spec.ts`
- Create: `api/src/health/health.service.ts`
- Create: `api/src/health/health.controller.ts`
- Create: `api/src/health/health.module.ts`
- Modify: `api/src/app.module.ts`

- [ ] **Step 1: Write failing health/readiness tests**

Create `api/test/health.controller.spec.ts` with tests that instantiate `HealthService` using Prisma-like objects:

```ts
import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

describe("HealthService", () => {
  it("returns process liveness without checking dependencies", () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);

    expect(service.health()).toEqual({ status: "ok" });
  });

  it("returns readiness when the database query succeeds", async () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);

    await expect(service.ready()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" }
    });
  });

  it("returns service unavailable when the database query fails", async () => {
    const service = new HealthService({
      $queryRaw: async () => {
        throw new Error("database offline");
      }
    } as never);

    await expect(service.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe("HealthController", () => {
  it("delegates health and readiness checks", async () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);
    const controller = new HealthController(service);

    expect(controller.health()).toEqual({ status: "ok" });
    await expect(controller.ready()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" }
    });
  });
});
```

- [ ] **Step 2: Run health test to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/health.controller.spec.ts
```

Expected: fails because `src/health/*` files do not exist.

- [ ] **Step 3: Implement health service/controller/module**

Add `HealthService.ready()` using `await this.prisma.$queryRaw\`SELECT 1\`` and throw `ServiceUnavailableException` with:

```ts
{
  status: "error",
  checks: { database: "error" }
}
```

Add `HealthController` routes:

```ts
@Controller()
export class HealthController {
  @Get("health")
  health() {
    return this.healthService.health();
  }

  @Get("ready")
  ready() {
    return this.healthService.ready();
  }
}
```

Register `HealthModule` in `AppModule`.

- [ ] **Step 4: Run health test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/health.controller.spec.ts
```

Expected: tests pass.

## Task 2: HTTP Launch Flow E2E

**Files:**
- Create: `api/test/support/launch-prisma-mock.ts`
- Create: `api/test/http-launch-readiness.e2e-spec.ts`

- [ ] **Step 1: Add failing HTTP e2e test**

Create a Supertest e2e spec that imports `AppModule`, overrides `PrismaService`, applies `api/v1` prefix and the same `ValidationPipe`, then tests:

1. `GET /api/v1/health` returns `{ status: "ok" }`.
2. `GET /api/v1/ready` returns `{ status: "ok", checks: { database: "ok" } }`.
3. Email-code login returns a dev code and then an access token.
4. Owner creates a listing and public `GET /listings/:id` returns 404 while it is draft.
5. Owner submits listing.
6. Owner cannot approve listing at admin endpoint and receives 403.
7. Admin approves listing.
8. Public `GET /listings/:id` returns the approved listing.
9. Owner likes a roommate, fetches active deal rooms, and requests a tour twice, receiving the same tour id.

- [ ] **Step 2: Run e2e test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/http-launch-readiness.e2e-spec.ts
```

Expected: fails before health module and test support are fully implemented.

- [ ] **Step 3: Implement in-memory Prisma support**

Create `api/test/support/launch-prisma-mock.ts` with methods needed by auth, listings, health, roommates, and deal rooms. It must expose:

```ts
export function createLaunchPrismaMock() { ... }
```

The mock should store verification codes, users, listings, roommate profiles, roommate actions, deal rooms, deal-room members, and tour requests in arrays. It should implement `$queryRaw`, `$connect`, `$disconnect`, and the Prisma methods used by the app services.

- [ ] **Step 4: Run e2e test to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/http-launch-readiness.e2e-spec.ts
```

Expected: HTTP launch flow passes.

## Task 3: Optional Real-Database Smoke Test

**Files:**
- Create: `api/test/launch-smoke.spec.ts`

- [ ] **Step 1: Add skipped-by-default smoke test**

Create `api/test/launch-smoke.spec.ts` that uses:

```ts
const runSmoke = process.env.RUN_DB_SMOKE === "1";
const describeSmoke = runSmoke ? describe : describe.skip;
```

The test should start the real `AppModule`, set `api/v1` prefix and validation, get real `PrismaService` and `JwtService`, create unique owner/admin users through Prisma, sign JWTs, then exercise listing review, public listing, roommate like, active room, and tour request through HTTP.

- [ ] **Step 2: Run smoke spec without DB flag**

Run:

```bash
./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: spec is skipped and exits successfully without requiring PostgreSQL.

- [ ] **Step 3: Run smoke spec with DB flag when PostgreSQL is available**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected when database is running and migrated: smoke test passes. If PostgreSQL is not available, report that the optional DB smoke could not be executed in this environment.

## Task 4: Launch Scripts And Docs

**Files:**
- Modify: `api/package.json`
- Modify: `README.md`

- [ ] **Step 1: Add scripts**

Add to `api/package.json`:

```json
"launch:check": "npm run test && npm run typecheck && npm run build && prisma validate",
"launch:smoke": "RUN_DB_SMOKE=1 vitest run test/launch-smoke.spec.ts"
```

- [ ] **Step 2: Document launch checks**

Add a README section:

```md
## Launch Readiness

From `api`:

```bash
npm run launch:check
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' npm run launch:smoke
```

`launch:check` runs the non-database pre-release checks. `launch:smoke` requires a migrated PostgreSQL database and exercises the core HTTP flow against real Prisma.
```

- [ ] **Step 3: Verify scripts**

Run:

```bash
npm run launch:check
./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: launch check passes; smoke spec is skipped by default.

## Task 5: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run full API tests**

```bash
cd api && ./node_modules/.bin/vitest run
```

Expected: all tests pass, with DB smoke skipped unless enabled.

- [ ] **Step 2: Run typecheck**

```bash
cd api && npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Run build**

```bash
cd api && npm run build
```

Expected: Prisma generation and Nest build pass.

- [ ] **Step 4: Run Prisma validate**

```bash
cd api && DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

Expected: schema is valid.

- [ ] **Step 5: Run diff checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files changed.
