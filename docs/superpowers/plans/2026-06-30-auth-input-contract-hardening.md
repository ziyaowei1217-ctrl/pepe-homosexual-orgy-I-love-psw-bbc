# Auth Input Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reject malformed auth email/code payloads at the HTTP boundary and prevent malformed codes from consuming verification attempts.

**Architecture:** Add HTTP e2e coverage for auth request validation. Use explicit route-level `ValidationPipe` instances with `expectedType` for auth DTOs, matching listing validation. Tighten DTOs with trim transforms and numeric six-digit code validation, and add a small AuthService guard for direct malformed code calls.

**Tech Stack:** NestJS controllers, class-validator, class-transformer, Vitest, Supertest, TypeScript.

---

## File Structure

- Create `api/test/auth-validation.e2e.spec.ts`: HTTP validation tests for auth email-code and verify-email payloads.
- Modify `api/src/auth/dto.ts`: trim emails and codes, reject blank emails, and require six numeric digits for verification codes.
- Modify `api/src/auth/auth.controller.ts`: add explicit body validation pipes for auth DTOs.
- Modify `api/src/auth/auth.service.ts`: reject malformed direct-service code values before querying or incrementing attempts.
- Modify `api/test/auth.service.spec.ts`: prove malformed direct-service codes do not consume attempts.

## Task 1: HTTP Auth Validation Tests

**Files:**
- Create: `api/test/auth-validation.e2e.spec.ts`

- [ ] **Step 1: Write failing HTTP validation tests**

Create `api/test/auth-validation.e2e.spec.ts`:

```ts
import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("auth HTTP validation", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects malformed email-code requests", async () => {
    const http = request(app.getHttpServer());

    await http.post("/api/v1/auth/email-code").send({ email: "not-an-email" }).expect(400);
    await http.post("/api/v1/auth/email-code").send({ email: "   " }).expect(400);
    await http.post("/api/v1/auth/email-code").send({ email: "owner@example.com", role: "ADMIN" }).expect(400);
  });

  it("rejects malformed verify-email requests without consuming the valid code", async () => {
    const http = request(app.getHttpServer());
    const codeResponse = await http.post("/api/v1/auth/email-code").send({ email: "owner@example.com" }).expect(201);

    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: "abc123" })
      .expect(400);
    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: "12345" })
      .expect(400);
    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: codeResponse.body.devCode, extra: true })
      .expect(400);

    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: " owner@example.com ", code: ` ${codeResponse.body.devCode} ` })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.accessToken).toEqual(expect.any(String));
      });
  });
});
```

- [ ] **Step 2: Run HTTP auth validation tests to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/auth-validation.e2e.spec.ts
```

Expected: tests fail because auth routes currently do not use explicit expected DTO types, and code format only checks length.

## Task 2: Service Guard Test

**Files:**
- Modify: `api/test/auth.service.spec.ts`

- [ ] **Step 1: Add failing direct-service malformed-code test**

Add to `api/test/auth.service.spec.ts`:

```ts
it("rejects malformed direct verification codes without consuming attempts", async () => {
  const prisma = createPrismaMock();
  const jwt = new JwtService({ secret: "test-secret" });
  const sender = createEmailSenderMock();
  const service = createAuthService(prisma, jwt, { nodeEnv: "development", emailSender: sender });

  await service.requestEmailCode("student@northeastern.edu");

  await expect(
    service.verifyEmailCode({
      email: "student@northeastern.edu",
      code: "abc123"
    })
  ).rejects.toBeInstanceOf(BadRequestException);

  expect(prisma.verificationCode.state.code?.attemptCount).toBe(0);
  expect(prisma.verificationCode.updateCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run AuthService tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/auth.service.spec.ts
```

Expected: the new test fails because `verifyEmailCode()` currently hashes malformed strings and increments attempts.

## Task 3: Auth DTO And Controller Implementation

**Files:**
- Modify: `api/src/auth/dto.ts`
- Modify: `api/src/auth/auth.controller.ts`
- Modify: `api/src/auth/auth.service.ts`

- [ ] **Step 1: Tighten auth DTOs**

Update `api/src/auth/dto.ts`:

```ts
import { Transform } from "class-transformer";
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from "class-validator";

function Trim() {
  return Transform(({ value }) => (typeof value === "string" ? value.trim() : value));
}
```

Use `@Trim()`, `@IsString()`, `@IsNotEmpty()`, and `@IsEmail()` for email fields. Use `@Trim()`, `@IsString()`, `@Length(6, 6)`, and `@Matches(/^\d{6}$/)` for `VerifyEmailDto.code`.

- [ ] **Step 2: Add explicit auth body pipes**

Update `api/src/auth/auth.controller.ts`:

```ts
import { Body, Controller, Get, Inject, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";
```

Add:

```ts
const emailCodeBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: EmailCodeDto
});

const verifyEmailBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: VerifyEmailDto
});
```

Use `@Body(emailCodeBodyPipe)` and `@Body(verifyEmailBodyPipe)`.

- [ ] **Step 3: Add direct service malformed-code guard**

Update `api/src/auth/auth.service.ts` near the start of `verifyEmailCode()`:

```ts
const code = dto.code.trim();
if (!/^\d{6}$/.test(code)) throw new BadRequestException("Verification code must be 6 digits");
```

Use `code` instead of `dto.code` in `verifyEmailCodeHash()`.

- [ ] **Step 4: Run focused tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/auth-validation.e2e.spec.ts test/auth.service.spec.ts test/http-launch-readiness.e2e.spec.ts
```

Expected: focused auth and launch readiness tests pass.

## Task 4: Launch Verification

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
git add api/src/auth/auth.controller.ts api/src/auth/auth.service.ts api/src/auth/dto.ts api/test/auth.service.spec.ts api/test/auth-validation.e2e.spec.ts docs/superpowers/specs/2026-06-30-auth-input-contract-hardening-design.md docs/superpowers/plans/2026-06-30-auth-input-contract-hardening.md
git commit -m "feat: harden auth input contracts"
```
