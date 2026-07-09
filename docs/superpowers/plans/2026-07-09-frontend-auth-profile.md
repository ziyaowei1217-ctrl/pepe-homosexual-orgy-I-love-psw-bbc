# Frontend Auth Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete email-code sign-in, session persistence, and profile onboarding flow to the existing Next.js marketplace page.

**Architecture:** Extend `lib/api.ts` with typed auth/profile helpers, add `lib/auth-session.ts` for versioned localStorage token handling, and upgrade the existing `AuthStrip` into a global account/profile panel. Keep the current single-page product experience and existing backend routes.

**Tech Stack:** Next.js client components, React state/effects, localStorage, NestJS auth/profile APIs, Vitest.

## Global Constraints

- Use the existing email-code backend; do not add password login.
- Keep the existing marketplace layout and Publish flow working.
- Store only the access token in localStorage.
- Show development `devCode` when the backend returns it.
- Keep profile contact fields editable only in the authenticated profile panel.

---

### Task 1: Auth API and Session Helpers

**Files:**
- Modify: `lib/api.ts`
- Create: `lib/auth-session.ts`
- Create: `tests/auth-session.test.ts`

**Interfaces:**
- Produces: `requestEmailCode`, `verifyEmailCode`, `getSessionUser`, `getMyProfile`, `updateMyProfile`, `readStoredAuthSession`, `writeStoredAuthSession`, `clearStoredAuthSession`

- [ ] **Step 1: Write failing tests for versioned token storage.**
- [ ] **Step 2: Add session helper implementation.**
- [ ] **Step 3: Add typed API helper functions and types.**
- [ ] **Step 4: Run `pnpm test tests/auth-session.test.ts`.**

### Task 2: Global Account and Profile UI

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: auth/profile helpers from `lib/api.ts` and `lib/auth-session.ts`
- Produces: global sign-in entry, sign-out, profile loading, profile update form, and Publish gating copy

- [ ] **Step 1: Add profile/session state to `HomePage`.**
- [ ] **Step 2: Replace direct localStorage calls with session helpers.**
- [ ] **Step 3: Pass auth/profile handlers to `AppHeader` and `AuthStrip`.**
- [ ] **Step 4: Expand `AuthStrip` into sign-in + profile onboarding states.**
- [ ] **Step 5: Run frontend tests and typecheck.**
