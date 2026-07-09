# Marketplace Database API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the new `profiles`, `roommate_profiles`, and `listings` database tables to authenticated NestJS HTTP APIs.

**Architecture:** Add a focused Marketplace module with DTOs, controller, and service. The service bridges the existing auth `User` table to the new UUID `Profile` table by authenticated email, then uses Prisma models for profile, roommate profile, and housing listing CRUD.

**Tech Stack:** NestJS, Prisma, PostgreSQL, class-validator, Vitest, Supertest.

## Global Constraints

- Keep existing demo `Listing` and `RoommateProfile` APIs working.
- Do not expose private contact fields such as `wechat` on public listing/profile responses.
- Authenticated writes must be scoped to the current user's profile.
- Roommate matching fields must not include nationality, race, ethnicity, or religion.

---

### Task 1: Marketplace HTTP Tests

**Files:**
- Create: `api/test/marketplace-api.e2e.spec.ts`
- Modify: `api/test/support/launch-prisma-mock.ts`

**Interfaces:**
- Consumes: `AppModule`, `PrismaService`, `createLaunchPrismaMock()`
- Produces: failing tests for profile, roommate profile, and housing listing API behavior

- [ ] **Step 1: Write failing e2e tests for authenticated profile upsert, public redaction, owner-scoped updates, and active listing search.**
- [ ] **Step 2: Run `pnpm --dir api test test/marketplace-api.e2e.spec.ts` and verify it fails because routes do not exist.**

### Task 2: Marketplace Module

**Files:**
- Create: `api/src/marketplace/marketplace.module.ts`
- Create: `api/src/marketplace/marketplace.controller.ts`
- Create: `api/src/marketplace/marketplace.service.ts`
- Create: `api/src/marketplace/dto.ts`
- Modify: `api/src/app.module.ts`

**Interfaces:**
- Consumes: `AuthenticatedRequest`, `AuthGuard`, Prisma models `profile`, `roommateMatchingProfile`, `housingListing`
- Produces: REST endpoints under `/api/v1/profiles`, `/api/v1/roommate-profiles`, and `/api/v1/housing-listings`

- [ ] **Step 1: Implement DTO validation for profile, roommate profile, and housing listing writes.**
- [ ] **Step 2: Implement service methods that ensure a profile by authenticated email and enforce owner scoping.**
- [ ] **Step 3: Implement controllers with `AuthGuard` for writes and public read endpoints for active records.**
- [ ] **Step 4: Register `MarketplaceModule` in `AppModule`.**
- [ ] **Step 5: Run the marketplace e2e test and make it pass.**

### Task 3: Verification

**Files:**
- Test: `api/test/marketplace-api.e2e.spec.ts`

- [ ] **Step 1: Run `pnpm --dir api test`.**
- [ ] **Step 2: Run `DATABASE_URL="postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public" pnpm --dir api prisma validate`.**
- [ ] **Step 3: Run `pnpm --dir api build`.**
