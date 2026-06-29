# Listing Review Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend publication review loop so listings are private drafts until submitted and approved by an admin.

**Architecture:** Keep review state directly on `Listing` with a Prisma enum and a small set of transition methods in `ListingsService`. Owner routes remain under the existing `ListingsController`, while admin review routes live in a focused admin controller protected by `AuthGuard` plus a small `AdminGuard`. Tests drive service behavior first, then controller/type/build verification proves route wiring.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, Vitest, TypeScript, class-validator.

---

## File Structure

- Modify `api/prisma/schema.prisma`: add `ListingStatus`, listing review fields, and listing indexes.
- Modify `api/prisma/migrations/20260629100000_init_commercial_baseline/migration.sql`: add the enum, columns, defaults, and indexes to the baseline migration.
- Modify `api/src/listings/dto.ts`: add `RejectListingDto` for admin rejection.
- Modify `api/src/listings/listings.service.ts`: enforce public visibility, owner edit/submit transitions, admin queue/approve/reject transitions.
- Modify `api/src/listings/listings.controller.ts`: add `/listings/mine` and `/listings/:id/submit` before the `/:id` read route.
- Create `api/src/auth/admin.guard.ts`: reusable role guard for admin-only endpoints.
- Create `api/src/listings/admin-listings.controller.ts`: admin review queue, approve, and reject endpoints.
- Modify `api/src/listings/listings.module.ts`: register the admin listings controller.
- Modify `api/test/listings.service.spec.ts`: replace the single create test with coverage for public, owner, and admin review behavior.

## Task 1: Service Tests For Public And Owner Listing Flow

**Files:**
- Modify: `api/test/listings.service.spec.ts`
- Later modifies: `api/src/listings/listings.service.ts`

- [ ] **Step 1: Write failing public visibility and owner flow tests**

Replace `api/test/listings.service.spec.ts` with a Prisma mock that stores listings in memory and add tests for:

```ts
it("returns only approved database listings for public discovery", async () => {
  const prisma = createPrismaMock({
    listings: [
      listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" }),
      listingRecord({ id: "approved", ownerId: "owner-1", status: "APPROVED" })
    ]
  });
  const service = new ListingsService(prisma as never);

  await expect(service.findAll()).resolves.toMatchObject([{ id: "approved" }]);
});

it("hides non-approved database listings from public detail reads", async () => {
  const prisma = createPrismaMock({
    listings: [listingRecord({ id: "draft", ownerId: "owner-1", status: "DRAFT" })]
  });
  const service = new ListingsService(prisma as never);

  await expect(service.findOne("draft")).rejects.toThrow(NotFoundException);
});

it("creates draft listings even when a client sends review status data", async () => {
  const prisma = createPrismaMock();
  const service = new ListingsService(prisma as never);

  const listing = await service.create("owner-1", {
    ...listingDto(),
    status: "APPROVED"
  } as never);

  expect(listing.status).toBe("DRAFT");
  expect(prisma.listing.createCalls[0].data.status).toBe("DRAFT");
});

it("lists all listings owned by the current user", async () => {
  const newer = listingRecord({ id: "newer", ownerId: "owner-1", status: "SUBMITTED", updatedAt: new Date("2026-01-02") });
  const older = listingRecord({ id: "older", ownerId: "owner-1", status: "DRAFT", updatedAt: new Date("2026-01-01") });
  const other = listingRecord({ id: "other", ownerId: "owner-2", status: "APPROVED" });
  const prisma = createPrismaMock({ listings: [older, newer, other] });
  const service = new ListingsService(prisma as never);

  await expect(service.findMine("owner-1")).resolves.toMatchObject([{ id: "newer" }, { id: "older" }]);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run from `api`:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: fails because `findAll()` does not filter `status`, `create()` does not write `DRAFT`, and `findMine()` does not exist.

- [ ] **Step 3: Implement minimal public and owner flow**

Update `ListingsService` to:

```ts
async findAll() {
  const records = await this.prisma.listing.findMany({
    where: { status: "APPROVED" },
    orderBy: { createdAt: "desc" }
  });

  return records.length > 0 ? records : seedListings;
}

async findOne(id: string) {
  const record = await this.prisma.listing.findUnique({ where: { id } });
  if (record?.status === "APPROVED") return record;

  const seeded = seedListings.find((listing) => listing.id === id);
  if (!seeded) throw new NotFoundException("Listing not found");

  return seeded;
}

async create(ownerId: string, dto: ListingDto) {
  return this.prisma.listing.create({
    data: {
      ownerId,
      status: "DRAFT",
      title: dto.title,
      area: dto.area,
      image: dto.image,
      price: dto.price,
      originalPrice: dto.originalPrice,
      beds: dto.beds,
      baths: dto.baths,
      commute: dto.commute,
      transit: dto.transit,
      trust: dto.trust,
      tags: dto.tags,
      score: dto.score ?? 4.8
    }
  });
}

async findMine(ownerId: string) {
  return this.prisma.listing.findMany({
    where: { ownerId },
    orderBy: { updatedAt: "desc" }
  });
}
```

- [ ] **Step 4: Run tests to verify GREEN for this slice**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: tests in this slice pass, while later unimplemented tests have not been added yet.

## Task 2: Service Tests For Owner Updates And Submit

**Files:**
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/src/listings/listings.service.ts`

- [ ] **Step 1: Add failing owner update and submit transition tests**

Add tests that assert:

```ts
it.each(["DRAFT", "REJECTED"] as const)("allows owners to update %s listings", async (status) => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
  const service = new ListingsService(prisma as never);

  const updated = await service.update("owner-1", "listing-1", { title: "Updated title" });

  expect(updated.title).toBe("Updated title");
  expect(updated.status).toBe(status);
});

it.each(["SUBMITTED", "APPROVED"] as const)("blocks owners from updating %s listings", async (status) => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status })] });
  const service = new ListingsService(prisma as never);

  await expect(service.update("owner-1", "listing-1", { title: "Updated title" })).rejects.toThrow(BadRequestException);
});

it("returns not found when a non-owner updates a listing", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })] });
  const service = new ListingsService(prisma as never);

  await expect(service.update("owner-2", "listing-1", { title: "Updated title" })).rejects.toThrow(NotFoundException);
});

it.each(["DRAFT", "REJECTED"] as const)("allows owners to submit %s listings", async (status) => {
  const prisma = createPrismaMock({
    listings: [
      listingRecord({
        id: "listing-1",
        ownerId: "owner-1",
        status,
        reviewedAt: new Date("2026-01-01"),
        reviewerId: "admin-1",
        rejectionReason: "Needs clearer photos"
      })
    ]
  });
  const service = new ListingsService(prisma as never);

  const submitted = await service.submit("owner-1", "listing-1");

  expect(submitted.status).toBe("SUBMITTED");
  expect(submitted.submittedAt).toBeInstanceOf(Date);
  expect(submitted.reviewedAt).toBeNull();
  expect(submitted.reviewerId).toBeNull();
  expect(submitted.rejectionReason).toBeNull();
});

it("returns not found when a non-owner submits a listing", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", ownerId: "owner-1", status: "DRAFT" })] });
  const service = new ListingsService(prisma as never);

  await expect(service.submit("owner-2", "listing-1")).rejects.toThrow(NotFoundException);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: fails because `update()` allows all owner statuses and `submit()` does not exist.

- [ ] **Step 3: Implement owner status enforcement and submit**

Update `ListingsService` with:

```ts
const editableListingStatuses = new Set(["DRAFT", "REJECTED"]);

async update(ownerId: string, id: string, dto: Partial<ListingDto>) {
  const listing = await this.prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
  if (!editableListingStatuses.has(listing.status)) {
    throw new BadRequestException("Listing cannot be edited in its current status");
  }

  return this.prisma.listing.update({
    where: { id },
    data: dto
  });
}

async submit(ownerId: string, id: string) {
  const listing = await this.prisma.listing.findUnique({ where: { id } });
  if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
  if (!editableListingStatuses.has(listing.status)) {
    throw new BadRequestException("Listing cannot be submitted in its current status");
  }

  return this.prisma.listing.update({
    where: { id },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      reviewedAt: null,
      reviewerId: null,
      rejectionReason: null
    }
  });
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: public/owner tests pass.

## Task 3: Service Tests For Admin Review

**Files:**
- Modify: `api/test/listings.service.spec.ts`
- Modify: `api/src/listings/listings.service.ts`

- [ ] **Step 1: Add failing admin queue and review tests**

Add tests that assert:

```ts
it("returns submitted listings ordered by oldest submission first", async () => {
  const newer = listingRecord({ id: "newer", status: "SUBMITTED", submittedAt: new Date("2026-01-02") });
  const older = listingRecord({ id: "older", status: "SUBMITTED", submittedAt: new Date("2026-01-01") });
  const draft = listingRecord({ id: "draft", status: "DRAFT" });
  const prisma = createPrismaMock({ listings: [newer, older, draft] });
  const service = new ListingsService(prisma as never);

  await expect(service.findReviewQueue()).resolves.toMatchObject([{ id: "older" }, { id: "newer" }]);
});

it("approves submitted listings and records reviewer metadata", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
  const service = new ListingsService(prisma as never);

  const approved = await service.approve("listing-1", "admin-1");

  expect(approved.status).toBe("APPROVED");
  expect(approved.reviewedAt).toBeInstanceOf(Date);
  expect(approved.reviewerId).toBe("admin-1");
  expect(approved.rejectionReason).toBeNull();
});

it("rejects submitted listings with a safe reason", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
  const service = new ListingsService(prisma as never);

  const rejected = await service.reject("listing-1", "admin-1", "Please add clearer bedroom photos");

  expect(rejected.status).toBe("REJECTED");
  expect(rejected.reviewedAt).toBeInstanceOf(Date);
  expect(rejected.reviewerId).toBe("admin-1");
  expect(rejected.rejectionReason).toBe("Please add clearer bedroom photos");
});

it("requires a non-empty rejection reason", async () => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status: "SUBMITTED" })] });
  const service = new ListingsService(prisma as never);

  await expect(service.reject("listing-1", "admin-1", "   ")).rejects.toThrow(BadRequestException);
});

it.each(["DRAFT", "APPROVED", "REJECTED"] as const)("blocks admin review for %s listings", async (status) => {
  const prisma = createPrismaMock({ listings: [listingRecord({ id: "listing-1", status })] });
  const service = new ListingsService(prisma as never);

  await expect(service.approve("listing-1", "admin-1")).rejects.toThrow(BadRequestException);
  await expect(service.reject("listing-1", "admin-1", "Reason")).rejects.toThrow(BadRequestException);
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: fails because admin methods do not exist.

- [ ] **Step 3: Implement admin review methods**

Update `ListingsService` with:

```ts
async findReviewQueue() {
  return this.prisma.listing.findMany({
    where: { status: "SUBMITTED" },
    orderBy: { submittedAt: "asc" }
  });
}

async approve(id: string, reviewerId: string) {
  await this.requireSubmittedListing(id);
  return this.prisma.listing.update({
    where: { id },
    data: {
      status: "APPROVED",
      reviewedAt: new Date(),
      reviewerId,
      rejectionReason: null
    }
  });
}

async reject(id: string, reviewerId: string, reason: string) {
  const rejectionReason = reason.trim();
  if (!rejectionReason) throw new BadRequestException("Rejection reason is required");

  await this.requireSubmittedListing(id);
  return this.prisma.listing.update({
    where: { id },
    data: {
      status: "REJECTED",
      reviewedAt: new Date(),
      reviewerId,
      rejectionReason
    }
  });
}

private async requireSubmittedListing(id: string) {
  const listing = await this.prisma.listing.findUnique({ where: { id } });
  if (!listing) throw new NotFoundException("Listing not found");
  if (listing.status !== "SUBMITTED") {
    throw new BadRequestException("Listing is not submitted for review");
  }
  return listing;
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: all listing service tests pass.

## Task 4: Prisma Schema And Baseline Migration

**Files:**
- Modify: `api/prisma/schema.prisma`
- Modify: `api/prisma/migrations/20260629100000_init_commercial_baseline/migration.sql`

- [ ] **Step 1: Add listing status enum and fields to Prisma schema**

Add:

```prisma
enum ListingStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
}
```

Update `Listing`:

```prisma
  status          ListingStatus  @default(DRAFT)
  submittedAt     DateTime?
  reviewedAt      DateTime?
  reviewerId      String?
  rejectionReason String?
```

Add indexes:

```prisma
  @@index([status, createdAt])
  @@index([ownerId, status, updatedAt])
```

- [ ] **Step 2: Update baseline migration SQL**

Add enum creation:

```sql
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');
```

Add listing columns:

```sql
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewerId" TEXT,
    "rejectionReason" TEXT,
```

Add indexes:

```sql
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
CREATE INDEX "Listing_ownerId_status_updatedAt_idx" ON "Listing"("ownerId", "status", "updatedAt");
```

- [ ] **Step 3: Validate Prisma schema**

Run from `api`:

```bash
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

Expected: schema is valid.

## Task 5: Admin Guard And Route Wiring

**Files:**
- Create: `api/src/auth/admin.guard.ts`
- Modify: `api/src/listings/dto.ts`
- Modify: `api/src/listings/listings.controller.ts`
- Create: `api/src/listings/admin-listings.controller.ts`
- Modify: `api/src/listings/listings.module.ts`

- [ ] **Step 1: Add `AdminGuard`**

Create:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";

import { AuthenticatedRequest } from "./auth.guard";

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.user?.role !== "ADMIN") throw new ForbiddenException("Admin access required");
    return true;
  }
}
```

- [ ] **Step 2: Add reject DTO**

Add to `api/src/listings/dto.ts`:

```ts
export class RejectListingDto {
  @IsString()
  reason!: string;
}
```

- [ ] **Step 3: Wire owner routes before `/:id`**

Update `ListingsController` so static routes come before `@Get(":id")`:

```ts
@UseGuards(AuthGuard)
@Get("mine")
findMine(@Req() request: AuthenticatedRequest) {
  return this.listings.findMine(request.user.id);
}

@UseGuards(AuthGuard)
@Post(":id/submit")
submit(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
  return this.listings.submit(request.user.id, id);
}
```

- [ ] **Step 4: Add admin listings controller**

Create `api/src/listings/admin-listings.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { RejectListingDto } from "./dto";
import { ListingsService } from "./listings.service";

@UseGuards(AuthGuard, AdminGuard)
@Controller("admin/listings")
export class AdminListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get("review-queue")
  findReviewQueue() {
    return this.listings.findReviewQueue();
  }

  @Post(":id/approve")
  approve(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.listings.approve(id, request.user.id);
  }

  @Post(":id/reject")
  reject(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: RejectListingDto) {
    return this.listings.reject(id, request.user.id, dto.reason);
  }
}
```

- [ ] **Step 5: Register admin controller**

Update `api/src/listings/listings.module.ts`:

```ts
@Module({
  controllers: [ListingsController, AdminListingsController],
  providers: [ListingsService]
})
export class ListingsModule {}
```

- [ ] **Step 6: Run typecheck**

Run from `api`:

```bash
npm run typecheck
```

Expected: typecheck passes after Prisma client generation includes `ListingStatus`.

## Task 6: Final Verification

**Files:**
- Verify all touched files.

- [ ] **Step 1: Run listing tests**

```bash
cd api && ./node_modules/.bin/vitest run test/listings.service.spec.ts
```

Expected: all listing service tests pass.

- [ ] **Step 2: Run full API tests**

```bash
cd api && ./node_modules/.bin/vitest run
```

Expected: all API tests pass.

- [ ] **Step 3: Run typecheck**

```bash
cd api && npm run typecheck
```

Expected: TypeScript reports no errors.

- [ ] **Step 4: Run build**

```bash
cd api && npm run build
```

Expected: Prisma generation and Nest build complete successfully.

- [ ] **Step 5: Validate Prisma schema**

```bash
cd api && DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate
```

Expected: Prisma schema is valid.

- [ ] **Step 6: Inspect git status**

```bash
git status --short
```

Expected: only intended listing review plan/code/test/schema files are modified.

