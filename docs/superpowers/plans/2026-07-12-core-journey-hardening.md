# Core Journey Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every primary renter-facing action meaningful and persist listing conversations, favorites, tours, applications, escrow progress, and notifications across routes and reloads.

**Architecture:** Add a versioned local workflow module containing pure normalization and transition helpers, then hydrate it once inside `SubletApp` and persist state changes after hydration. Keep optional API synchronization, but make the browser-local state authoritative for the demo. Derive saved views, notification panels, exclusive roommate queue columns, and Trips presentation from those normalized records.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest, Tailwind CSS, browser-client Playwright API.

## Global Constraints

- Booking requires an explicit listing, slot, and confirmation.
- Route query parameters may select context but may not create workflow records.
- Publishing remains authenticated and API-backed.
- Trust/Admin remains an explicit static demo.
- Every production behavior change begins with a failing Vitest test.
- Existing authenticated API synchronization remains non-blocking after local updates.

---

### Task 1: Versioned Local Listing Workflow Store

**Files:**
- Create: `lib/local-workflow.ts`
- Create: `tests/local-workflow.test.ts`

**Interfaces:**
- Produces: `LocalWorkflowState`, `LocalApplication`, `LocalNotification`, `emptyLocalWorkflowState`, `normalizeLocalWorkflowState`, `createLocalApplication`, `advanceLocalApplication`, `addLocalNotification`.
- Consumes: `DealThread` and `ViewingRequest` from `lib/deal-workflow.ts`.

- [ ] **Step 1: Write failing normalization tests**

```ts
it("hydrates valid workflow records and ignores malformed entries", () => {
  expect(normalizeLocalWorkflowState({
    version: 1,
    favoriteListingIds: ["1", 2],
    contactedListingIds: ["1"],
    dealThreads: {},
    viewingRequests: [],
    applications: [],
    notifications: []
  })).toMatchObject({ version: 1, favoriteListingIds: ["1"] });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/local-workflow.test.ts`

Expected: FAIL because `lib/local-workflow.ts` does not exist.

- [ ] **Step 3: Implement the versioned types, validators, and defaults**

```ts
export type LocalWorkflowState = {
  version: 1;
  favoriteListingIds: string[];
  contactedListingIds: string[];
  dealThreads: Record<string, DealThread>;
  viewingRequests: ViewingRequest[];
  applications: LocalApplication[];
  notifications: LocalNotification[];
};

export const emptyLocalWorkflowState: LocalWorkflowState = {
  version: 1,
  favoriteListingIds: ["1"],
  contactedListingIds: [],
  dealThreads: {},
  viewingRequests: [],
  applications: [],
  notifications: []
};
```

- [ ] **Step 4: Add failing transition tests**

Test that application creation is idempotent per listing, escrow advances only to the final step, notifications are newest-first and deduplicated by ID, and malformed timestamps fall back safely.

- [ ] **Step 5: Implement minimal pure transitions and run GREEN**

Run: `pnpm vitest run tests/local-workflow.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/local-workflow.ts tests/local-workflow.test.ts
git commit -m "feat: add durable local workflow state"
```

---

### Task 2: Saved Homes, Notifications, and Durable Hydration

**Files:**
- Modify: `components/sublet-app.tsx`
- Modify: `lib/listing-selection.ts`
- Modify: `tests/listing-selection.test.ts`
- Create: `lib/notification-center.ts`
- Create: `tests/notification-center.test.ts`

**Interfaces:**
- Consumes: `normalizeLocalWorkflowState` and `LocalNotification` from Task 1.
- Produces: `filterSavedListings`, `getUnreadNotificationCount`, `markNotificationsRead`.

- [ ] **Step 1: Write failing saved-list tests**

```ts
it("shows only favorite listings in saved mode", () => {
  expect(filterSavedListings(listings, new Set(["2"]), true).map(item => item.id)).toEqual(["2"]);
});
```

- [ ] **Step 2: Verify RED, implement helper, verify GREEN**

Run: `pnpm vitest run tests/listing-selection.test.ts`

- [ ] **Step 3: Write failing notification tests**

Test newest-first sorting, unread count, and immutable mark-read behavior.

- [ ] **Step 4: Verify RED, implement notification helpers, verify GREEN**

Run: `pnpm vitest run tests/notification-center.test.ts`

- [ ] **Step 5: Hydrate and persist listing workflow in `SubletApp`**

Use one hydration guard and local storage key `sublet-pipeline-local-workflow-v1`. Initialize favorites, contacted IDs, deal threads, viewing requests, applications, and notifications from the normalized payload. Persist only after hydration.

- [ ] **Step 6: Implement Saved Homes and Notifications panels**

Add `savedOnly`, `notificationsOpen`, and accessible panel state. Saved Homes toggles saved-only Discover mode without mutating search filters. Notifications shows event label, context, time, read state, and a purposeful empty state.

- [ ] **Step 7: Run focused and full tests**

Run: `pnpm vitest run tests/listing-selection.test.ts tests/notification-center.test.ts && pnpm typecheck`

- [ ] **Step 8: Commit**

```bash
git add components/sublet-app.tsx lib/listing-selection.ts lib/notification-center.ts tests/listing-selection.test.ts tests/notification-center.test.ts
git commit -m "feat: add saved homes and notifications"
```

---

### Task 3: Explicit DM and Tour Scheduling Flow

**Files:**
- Modify: `components/sublet-app.tsx`
- Modify: `lib/deal-workflow.ts`
- Modify: `tests/deal-workflow.test.ts`
- Modify: `lib/roommate-dm.ts`
- Modify: `tests/roommate-dm.test.ts`

**Interfaces:**
- Produces: `upsertViewingRequest`, `getTourSchedulerIntent`, and controlled composer draft callbacks.
- Consumes: durable workflow state from Tasks 1-2.

- [ ] **Step 1: Write failing viewing-request tests**

Test that an explicit slot is required, a second request for the same listing adjusts the existing request, and another listing keeps an independent request.

- [ ] **Step 2: Verify RED and implement pure upsert behavior**

Run: `pnpm vitest run tests/deal-workflow.test.ts`

- [ ] **Step 3: Write failing quick-reply behavior tests**

Extract a pure `getComposerDraftAfterQuickReply(currentDraft, reply)` helper and assert that it returns the reply without appending a message.

- [ ] **Step 4: Verify RED and implement GREEN**

Run: `pnpm vitest run tests/deal-workflow.test.ts tests/roommate-dm.test.ts`

- [ ] **Step 5: Change listing-detail tour action**

Replace direct `handleRequestListingTour(listing)` with a handler that calls `dmRouteForTarget({ kind: "listing", id: listing.id }, { tour: true })`, producing URLs such as `/messages?listingId=1&tour=1`. In Messages, consume the query as presentation intent only, focus the scheduler, and require slot selection plus `确认预约看房`.

- [ ] **Step 6: Persist confirmed tours and messages**

Update local state first, add notification events, then attempt authenticated API sync. Verify the persisted records feed Messages and Trips after remount.

- [ ] **Step 7: Make quick replies fill both composers**

Convert landlord and roommate communication panels to controlled drafts or explicit `onQuickReply` setters. Chips must never call the send callback.

- [ ] **Step 8: Run focused tests and commit**

```bash
pnpm vitest run tests/deal-workflow.test.ts tests/roommate-dm.test.ts
git add components/sublet-app.tsx lib/deal-workflow.ts lib/roommate-dm.ts tests/deal-workflow.test.ts tests/roommate-dm.test.ts
git commit -m "fix: require explicit tour confirmation"
```

---

### Task 4: Applications, Trips, and Per-Application Escrow

**Files:**
- Modify: `components/sublet-app.tsx`
- Modify: `lib/app-routes.ts`
- Modify: `tests/app-routes.test.ts`
- Modify: `lib/local-workflow.ts`
- Modify: `tests/local-workflow.test.ts`

**Interfaces:**
- Consumes: `createLocalApplication`, `advanceLocalApplication`.
- Produces: Trips view grouped by listing and application ID.

- [ ] **Step 1: Extend failing application tests**

Assert that starting an application creates one record with `status: "pending_payment"`, repeated starts reuse it, and advancement changes only the targeted application.

- [ ] **Step 2: Verify RED, implement transitions, verify GREEN**

Run: `pnpm vitest run tests/local-workflow.test.ts`

- [ ] **Step 3: Add Trips navigation route tests**

Assert that desktop renter navigation includes Trips and that route helpers map `/trips` consistently.

- [ ] **Step 4: Implement application creation and Trips grouping**

`开始申请` writes the application and notification before navigating. Trips renders each application with its own escrow timeline plus viewing requests for the same listing. Without an application, Trips shows scheduled tours and an application CTA rather than an active escrow panel.

- [ ] **Step 5: Persist escrow transitions and add notifications**

Advance by application ID and store the result. Disable the button at `completed`.

- [ ] **Step 6: Run focused checks and commit**

```bash
pnpm vitest run tests/local-workflow.test.ts tests/app-routes.test.ts
pnpm typecheck
git add components/sublet-app.tsx lib/app-routes.ts lib/local-workflow.ts tests/app-routes.test.ts tests/local-workflow.test.ts
git commit -m "feat: persist applications and trips"
```

---

### Task 5: Exclusive Like Queue and Explicit Group Tour Context

**Files:**
- Create: `lib/roommate-queue.ts`
- Create: `tests/roommate-queue.test.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `lib/app-routes.ts`
- Modify: `tests/app-routes.test.ts`

**Interfaces:**
- Produces: `classifyRoommateQueue`, `GroupTourIntent`.
- Consumes: `RoommateConnectionState` and existing route helpers.

- [ ] **Step 1: Write failing exclusive-classification tests**

Test waiting, mutual, and roommate membership, asserting that the combined IDs are unique and a selected roommate appears only in `roommates`.

- [ ] **Step 2: Verify RED, implement classifier, verify GREEN**

Run: `pnpm vitest run tests/roommate-queue.test.ts`

- [ ] **Step 3: Replace duplicated Like Queue filters**

Render each classifier result in its own column. Update headings and counts to match exclusive data.

- [ ] **Step 4: Add group-tour route intent tests**

Test that group-tour mode can navigate to Stay without creating a tour and that selecting a listing creates a Messages URL with `groupTour=1` and `listingId`.

- [ ] **Step 5: Implement explicit group-tour selection**

`Request group tour` enters saved group-tour selection mode. Listing cards show `Choose for group tour`; selection opens Messages with group context, where the normal explicit scheduler confirms the request.

- [ ] **Step 6: Run focused checks and commit**

```bash
pnpm vitest run tests/roommate-queue.test.ts tests/app-routes.test.ts
git add components/sublet-app.tsx lib/roommate-queue.ts lib/app-routes.ts tests/roommate-queue.test.ts tests/app-routes.test.ts
git commit -m "fix: make roommate queue and group tours explicit"
```

---

### Task 6: Responsive Navigation and Offline Demo Polish

**Files:**
- Modify: `components/sublet-app.tsx`
- Modify: `app/layout.tsx`
- Create: `lib/api-status.ts`
- Create: `tests/api-status.test.ts`

**Interfaces:**
- Produces: `getApiPresentationState`.

- [ ] **Step 1: Write failing API presentation tests**

Assert that network errors map to `{ mode: "demo", label: "本地 Demo 模式" }` while authenticated server errors retain actionable sync copy.

- [ ] **Step 2: Verify RED, implement helper, verify GREEN**

Run: `pnpm vitest run tests/api-status.test.ts`

- [ ] **Step 3: Implement responsive navigation**

Add Trips to desktop navigation. Make `Open menu` toggle an accessible mobile panel containing Stay, Roommates, Messages, Trips, Saved Homes, Notifications, and Host. Close it after navigation.

- [ ] **Step 4: Polish offline messaging**

Replace raw `Failed to fetch` UI with the presentation helper. Keep Publish gated and explain that publishing needs sign-in plus API availability.

- [ ] **Step 5: Address the Next.js scroll warning**

Add `data-scroll-behavior="smooth"` to the root `<html>` element because the app intentionally uses smooth scrolling.

- [ ] **Step 6: Run focused checks and commit**

```bash
pnpm vitest run tests/api-status.test.ts
pnpm lint && pnpm typecheck
git add components/sublet-app.tsx app/layout.tsx lib/api-status.ts tests/api-status.test.ts
git commit -m "fix: complete navigation and offline presentation"
```

---

### Task 7: Full Verification and Browser Regression Pass

**Files:**
- Modify if required by discovered regressions: files owned by Tasks 1-6
- Test: all `tests/*.test.ts`

**Interfaces:**
- Consumes all previous task outputs.

- [ ] **Step 1: Run the complete project check**

Run: `pnpm check`

Expected: lint, typecheck, all Vitest tests, and production build pass.

- [ ] **Step 2: Desktop browser checklist**

At a desktop viewport, verify navigation, filters, map-to-card selection, saved-only view, notification panel, listing gallery and detail, landlord DM draft/send, roommate Like/Later and DM draft/send, exclusive Like Queue, explicit tour booking, application creation, Trips records, escrow progress, route navigation, and reload persistence.

- [ ] **Step 3: Mobile browser checklist**

At a narrow viewport, verify the menu opens, every renter destination is reachable, panels remain usable, message composers are visible, tour slots can be selected, and there is no horizontal overflow.

- [ ] **Step 4: Inspect browser logs**

Expected: no application error logs and no missing smooth-scroll warning.

- [ ] **Step 5: Fix any regression with a new RED/GREEN test cycle**

Do not patch browser symptoms directly. Add the smallest failing test, implement the root-cause fix, rerun focused tests, and repeat the affected browser step.

- [ ] **Step 6: Re-run `pnpm check` and commit verification fixes**

```bash
pnpm check
git add app components lib tests
git commit -m "fix: close core journey regressions"
```
