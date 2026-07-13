# Responsive Message Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DM navigation open a real conversation view on narrow screens and make listing links from Messages durable and reloadable.

**Architecture:** Keep the unified inbox and desktop split view. Derive a narrow-screen pane mode from whether the URL requested a conversation, synchronize component state when route props change, and use query-backed listing detail routes for every listing open action.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Tailwind CSS, browser-client Playwright API.

## Global Constraints

- Desktop Messages keeps contacts and conversation side by side.
- Narrow Messages shows exactly one pane: contacts at `/messages`, conversation for a target URL.
- Route query parameters select context but never create contacts or workflow records.
- Browser Back and refresh preserve visible content and URL consistency.
- Every production behavior change begins with a failing Vitest test.

---

### Task 1: Route-derived message panes

**Files:**
- Modify: `lib/message-inbox.ts`
- Modify: `tests/message-inbox.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Produces: `getNarrowMessagePane(target: InboxTarget | null): "contacts" | "conversation"`.
- Consumes: `requestedInboxTarget` already derived from the listing and roommate route state.

- [ ] **Step 1: Write the failing pane tests**

```ts
expect(getNarrowMessagePane(null)).toBe("contacts");
expect(getNarrowMessagePane({ kind: "roommate", targetId: "mia" })).toBe("conversation");
```

- [ ] **Step 2: Run `pnpm vitest run tests/message-inbox.test.ts` and verify it fails because the helper is missing.**

- [ ] **Step 3: Implement the pure helper, route-prop synchronization, responsive pane classes, `返回联系人`, and scroll-to-top behavior.**

- [ ] **Step 4: Run `pnpm vitest run tests/message-inbox.test.ts` and verify all message inbox tests pass.**

### Task 2: Durable listing detail navigation

**Files:**
- Modify: `lib/app-routes.ts`
- Modify: `tests/app-routes.test.ts`
- Modify: `app/page.tsx`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Produces: `listingDetailRoute(listingId: string): string`.
- Consumes: `initialListingId` from the root route search parameters.

- [ ] **Step 1: Write a failing test asserting `listingDetailRoute("westwood")` returns `/?listingId=westwood`.**

- [ ] **Step 2: Run `pnpm vitest run tests/app-routes.test.ts` and verify it fails because the helper is missing.**

- [ ] **Step 3: Implement the helper, initialize listing detail from the query, keep local hydration from overriding the explicit route, and push the route from `openListingDetail`.**

- [ ] **Step 4: Run `pnpm vitest run tests/app-routes.test.ts` and verify all route tests pass.**

### Task 3: Full verification and browser journeys

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: responsive pane and listing route behavior from Tasks 1-2.
- Produces: updated feature branch and Pull Request.

- [ ] **Step 1: Stop the development server, run `pnpm check`, and require exit code 0.**

- [ ] **Step 2: Restart the website on port 3001.**

- [ ] **Step 3: At 768px verify `/messages` shows contacts only; opening roommate and landlord DMs shows the conversation at the top; `返回联系人` returns to contacts.**

- [ ] **Step 4: At 1280px verify contacts and conversation remain side by side.**

- [ ] **Step 5: Verify `查看房源` opens `/?listingId=<id>`, refresh keeps the detail, and browser Back returns to the DM.**

- [ ] **Step 6: Commit and push the verified changes to `codex/core-journey-hardening`.**
