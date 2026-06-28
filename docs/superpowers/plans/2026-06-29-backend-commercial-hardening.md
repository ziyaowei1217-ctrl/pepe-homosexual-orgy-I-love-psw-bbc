# Backend Commercial Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current NestJS API safer and more deployable by hardening auth, config, validation, migrations, and backend coverage.

**Architecture:** Keep the existing NestJS/Prisma structure. Add small focused utilities for verification-code hashing and production config, evolve the Prisma schema with migration SQL, and prove behavior through Vitest service tests.

**Tech Stack:** NestJS 10, Prisma 6, PostgreSQL, Vitest, TypeScript, Node crypto.

---

## File Structure

- Create `api/src/auth/code-security.ts`: generate numeric codes, hash codes, verify hashes, and normalize email.
- Modify `api/src/auth/auth.service.ts`: store code hashes, hide dev codes in production, cap attempts.
- Modify `api/prisma/schema.prisma`: replace plaintext verification code usage with hash and attempt columns while preserving compatibility.
- Create `api/prisma/migrations/20260629100000_init_commercial_baseline/migration.sql`: full baseline migration for the current schema.
- Create `api/src/config/env.ts`: production-safe JWT secret helper.
- Modify `api/src/app.module.ts`: use the JWT secret helper.
- Modify `api/src/main.ts`: enable stricter validation and basic security headers.
- Modify `api/test/auth.service.spec.ts`: add red/green tests for hashed code storage, attempt cap, and production response.
- Create `api/test/match-transaction-flow.spec.ts`: test auth-like user context -> roommate like -> active deal room -> tour request with service wiring.
- Modify `api/.env.example`: document production requirements.

## Task 1: Auth Safety Tests

- [ ] Write failing tests in `api/test/auth.service.spec.ts` for hashed stored codes, no `devCode` in production mode, and attempt cap after five bad attempts.
- [ ] Run `./node_modules/.bin/vitest run test/auth.service.spec.ts` from `api`; expect failure on plaintext/dev-code behavior.
- [ ] Implement `api/src/auth/code-security.ts` and update `AuthService`.
- [ ] Run the auth tests again; expect pass.

## Task 2: Production Config Tests

- [ ] Add tests for `getJwtSecret()` in a new or existing config test.
- [ ] Verify RED when helper does not exist.
- [ ] Implement `api/src/config/env.ts`.
- [ ] Wire `AppModule` to use `getJwtSecret()`.
- [ ] Run `npm run typecheck` from `api`; expect pass.

## Task 3: Prisma Migration

- [ ] Update `VerificationCode` fields in `api/prisma/schema.prisma`.
- [ ] Generate baseline migration SQL with Prisma diff from empty schema.
- [ ] Save it under `api/prisma/migrations/20260629100000_init_commercial_baseline/migration.sql`.
- [ ] Run `DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate` from `api`; expect pass.

## Task 4: API Hardening

- [ ] Update `main.ts` to use `forbidNonWhitelisted: true`.
- [ ] Add basic security headers middleware for `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.
- [ ] Keep CORS origin explicit from `WEB_ORIGIN`.
- [ ] Run `npm run typecheck`; expect pass.

## Task 5: Match Transaction Flow Coverage

- [ ] Create `api/test/match-transaction-flow.spec.ts`.
- [ ] Test service-level flow: request/verify auth session shape, record roommate LIKE, fetch active room, request tour.
- [ ] Run `./node_modules/.bin/vitest run`; expect pass.

## Final Verification

- [ ] Run `./node_modules/.bin/vitest run` from `api`.
- [ ] Run `npm run typecheck` from `api`.
- [ ] Run `npm run build` from `api`.
- [ ] Run `DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' ./node_modules/.bin/prisma validate` from `api`.
- [ ] Run `git status --short` from the repository root.
