# API Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden listing and review write endpoints so malformed payloads are rejected consistently before launch testing.

**Architecture:** Add HTTP-level validation coverage with the existing Nest TestingModule and in-memory Prisma mock. Replace broad listing DTO usage with explicit create/update/reject DTOs that trim and validate incoming payloads. Keep service-layer ownership and state protections, and add a direct service guard for empty updates.

**Tech Stack:** NestJS 10, class-validator, class-transformer, Prisma, Vitest, Supertest, TypeScript.

---

## File Structure

- Create `api/test/listings-validation.e2e.spec.ts`: HTTP contract tests for invalid listing create/update/reject payloads.
- Modify `api/src/listings/dto.ts`: create explicit DTOs, trim transforms, bounded validation rules, and update-at-least-one-field validation.
- Modify `api/src/listings/listings.controller.ts`: use `CreateListingDto` and `UpdateListingDto`.
- Modify `api/src/listings/listings.service.ts`: use the new DTO types and reject direct empty updates before Prisma.
- Modify `api/test/listings.service.spec.ts`: add direct service empty-update coverage and update DTO imports.

## Task 1: HTTP Contract Tests

**Files:**
- Create: `api/test/listings-validation.e2e.spec.ts`

- [ ] **Step 1: Write failing HTTP validation tests**

Create `api/test/listings-validation.e2e.spec.ts`:

```ts
import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("listing HTTP validation", () => {
  let app: INestApplication;
  let token: string;
  let adminToken: string;

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

    token = await signIn(app, "owner@example.com");
    adminToken = await signIn(app, "admin@example.com");
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects malformed listing create payloads", async () => {
    const http = request(app.getHttpServer());

    await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send({
      ...listingPayload(),
      title: "   "
    }).expect(400);

    await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send({
      ...listingPayload(),
      image: "not-a-url"
    }).expect(400);

    await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send({
      ...listingPayload(),
      beds: 1.5
    }).expect(400);

    await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send({
      ...listingPayload(),
      tags: []
    }).expect(400);
  });

  it("rejects server-owned listing fields at the HTTP boundary", async () => {
    const http = request(app.getHttpServer());

    await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send({
      ...listingPayload(),
      status: "APPROVED"
    }).expect(400);
  });

  it("allows trimmed partial updates and rejects empty updates", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);

    await http.patch(`/api/v1/listings/${created.id}`).set("Authorization", `Bearer ${token}`).send({}).expect(400);

    await http.patch(`/api/v1/listings/${created.id}`).set("Authorization", `Bearer ${token}`).send({
      title: "  Updated Fenway room  "
    }).expect(200).expect(({ body }: { body: Record<string, unknown> }) => {
      expect(body.title).toBe("Updated Fenway room");
    });
  });

  it("validates and trims admin rejection reasons", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    await http.post(`/api/v1/listings/${created.id}/submit`).set("Authorization", `Bearer ${token}`).expect(201);

    await http.post(`/api/v1/admin/listings/${created.id}/reject`).set("Authorization", `Bearer ${adminToken}`).send({
      reason: "   "
    }).expect(400);

    await http.post(`/api/v1/admin/listings/${created.id}/reject`).set("Authorization", `Bearer ${adminToken}`).send({
      reason: "  Needs clearer bedroom photos  "
    }).expect(201).expect(({ body }: { body: Record<string, unknown> }) => {
      expect(body.rejectionReason).toBe("Needs clearer bedroom photos");
    });
  });
});

async function signIn(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const codeResponse = await http.post("/api/v1/auth/email-code").send({ email }).expect(201);
  const sessionResponse = await http
    .post("/api/v1/auth/verify-email")
    .send({ email, code: codeResponse.body.devCode })
    .expect(201);
  return sessionResponse.body.accessToken as string;
}

async function createListing(http: ReturnType<typeof request>, token: string) {
  const response = await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send(listingPayload()).expect(201);
  return response.body as { id: string };
}

function listingPayload() {
  return {
    title: "Launch-ready Fenway sublet",
    area: "Boston - Fenway",
    image: "https://example.com/fenway.jpg",
    price: 1800,
    originalPrice: 2100,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes by train to Back Bay",
    trust: ".edu verified",
    tags: ["video tour", "verified"],
    score: 4.9
  };
}
```

- [ ] **Step 2: Run tests to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/listings-validation.e2e.spec.ts
```

Expected: at least one invalid payload assertion fails because current DTOs do not trim or bound several values and update accepts an empty body.

## Task 2: DTO Contract Implementation

**Files:**
- Modify: `api/src/listings/dto.ts`
- Modify: `api/src/listings/listings.controller.ts`

- [ ] **Step 1: Replace listing DTOs with explicit create/update/reject contracts**

Update `api/src/listings/dto.ts` to export `CreateListingDto`, `UpdateListingDto`, `ListingDto`, and `RejectListingDto`. Use `@Transform` to trim strings and arrays, `@IsNotEmpty`, `@MaxLength`, `@IsUrl`, `@IsInt`, `@Min`, `@Max`, `@ArrayNotEmpty`, `@ArrayMaxSize`, and a custom `HasAtLeastOneEditableField` validator for updates.

Core shape:

```ts
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  registerDecorator,
  ValidationArguments,
  ValidationOptions
} from "class-validator";
```

Use practical bounds:

```ts
const editableListingFields = [
  "title",
  "area",
  "image",
  "price",
  "originalPrice",
  "beds",
  "baths",
  "commute",
  "transit",
  "trust",
  "tags",
  "score"
] as const;
const maxPrice = 100_000;
const maxRooms = 20;
const maxShortTextLength = 140;
const maxLongTextLength = 280;
const maxTags = 12;
const maxTagLength = 40;
```

- [ ] **Step 2: Wire controller methods to new DTOs**

Update `api/src/listings/listings.controller.ts` imports and method signatures:

```ts
import { CreateListingDto, UpdateListingDto } from "./dto";
```

```ts
create(@Req() request: AuthenticatedRequest, @Body() dto: CreateListingDto) {
  return this.listings.create(request.user.id, dto);
}

update(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: UpdateListingDto) {
  return this.listings.update(request.user.id, id, dto);
}
```

- [ ] **Step 3: Run HTTP validation tests to verify GREEN for DTO behavior**

Run:

```bash
./node_modules/.bin/vitest run test/listings-validation.e2e.spec.ts
```

Expected: all new HTTP validation tests pass except any service-only empty-update guard not yet implemented.

## Task 3: Service Boundary Guard

**Files:**
- Modify: `api/src/listings/listings.service.ts`
- Modify: `api/test/listings.service.spec.ts`

- [ ] **Step 1: Add failing service test for direct empty update**

Add to `api/test/listings.service.spec.ts`:

```ts
it("rejects empty direct service updates before calling Prisma", async () => {
  const prisma = createPrismaMock({
    listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })]
  });
  const service = new ListingsService(prisma as never);

  await expect(service.update("owner-1", "listing-1", {})).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 2: Run service test to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: the new empty-update service test fails because the service currently passes an all-undefined update object to Prisma.

- [ ] **Step 3: Implement minimal service guard**

Update `api/src/listings/listings.service.ts` to import `CreateListingDto` and `UpdateListingDto`, then make `listingUpdateData()` drop undefined values. In `update()`, reject when the resulting object has no keys:

```ts
const data = listingUpdateData(dto);
if (Object.keys(data).length === 0) {
  throw new BadRequestException("At least one editable listing field is required");
}

return this.prisma.listing.update({
  where: { id },
  data
});
```

- [ ] **Step 4: Run service and HTTP tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts test/listings-validation.e2e.spec.ts
```

Expected: both files pass.

## Task 4: Launch Verification

**Files:**
- No new files beyond previous tasks.

- [ ] **Step 1: Run full launch check**

Run from `api`:

```bash
npm run launch:check
```

Expected: tests, typecheck, build, and Prisma validate pass.

- [ ] **Step 2: Run optional real-Postgres smoke if Docker DB is available**

Run from `api`:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/vitest run test/launch-smoke.spec.ts
```

Expected: launch smoke test passes against the Docker Postgres database.

- [ ] **Step 3: Commit implementation**

Run from repository root:

```bash
git add api/src/listings/dto.ts api/src/listings/listings.controller.ts api/src/listings/listings.service.ts api/test/listings.service.spec.ts api/test/listings-validation.e2e.spec.ts docs/superpowers/plans/2026-06-30-api-contract-hardening.md
git commit -m "feat: harden listing api contracts"
```
