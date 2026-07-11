# Roommate DM Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the in-progress roommate DM so mutual matches can exchange locally persisted demo messages without exposing a locked thread or carrying a draft to the wrong recipient.

**Architecture:** Keep thread construction and stored-data normalization in `lib/roommate-dm.ts`, keep mutual-match authorization in `lib/roommate-match-flow.ts`, and leave orchestration/rendering in `components/sublet-app.tsx`. The frontend remains a local demo; this plan does not add backend messages, change the newer `Decide roommate` product step, or reinterpret backend Deal Rooms as mutual-like truth.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Vitest 2, ESLint 9, browser localStorage.

## Global Constraints

- Preserve the existing mutual-like requirement for opening and sending roommate DMs.
- Preserve the current `mutual -> Decide roommate -> group tour` flow introduced by the latest application rewrite.
- Do not add Prisma models, migrations, WebSockets, realtime delivery, or new dependencies.
- Treat outgoing messages as local demo state; do not claim backend delivery.
- Preserve all carried-over workspace edits and avoid unrelated refactors in the 5,000-line app component.

---

### Task 1: Normalize persisted roommate DM data

**Files:**
- Modify: `lib/roommate-dm.ts`
- Modify: `tests/roommate-dm.test.ts`

**Interfaces:**
- Consumes: arbitrary parsed JSON passed to `getStoredRoommateDmThreads(storedThreads: unknown)`.
- Produces: `Record<string, StoredRoommateDmThread>` containing only non-empty roommate IDs and structurally valid messages.

- [ ] **Step 1: Add a failing malformed-storage test**

```ts
it("drops malformed stored threads and messages", () => {
  const validMessage = {
    id: "stored-1",
    author: "You",
    body: "Budget works for me",
    time: "9:00 AM",
    align: "right" as const
  };

  const hydrated = getStoredRoommateDmThreads([
    null,
    { roommateId: "", messages: [validMessage] },
    { roommateId: "Mia Chen", messages: [validMessage, { body: 42 }] }
  ]);

  expect(Object.keys(hydrated)).toEqual(["Mia Chen"]);
  expect(hydrated["Mia Chen"].messages).toEqual([validMessage]);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test -- tests/roommate-dm.test.ts`

Expected: FAIL because the current helper dereferences `null` and trusts malformed messages.

- [ ] **Step 3: Implement structural guards**

```ts
export function getStoredRoommateDmThreads(storedThreads: unknown) {
  if (!Array.isArray(storedThreads)) return {};

  return Object.fromEntries(
    storedThreads.flatMap((thread) => {
      if (!isRecord(thread) || typeof thread.roommateId !== "string" || !thread.roommateId.trim()) return [];
      if (!Array.isArray(thread.messages)) return [];

      const messages = thread.messages.filter(isRoommateDmMessage);
      return [[thread.roommateId, { roommateId: thread.roommateId, messages } satisfies StoredRoommateDmThread]];
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoommateDmMessage(value: unknown): value is RoommateDmMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    typeof value.time === "string" &&
    (value.align === "left" || value.align === "right")
  );
}
```

Update `readStoredRoommateDmThreads` to pass parsed JSON directly, without a type assertion.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run: `pnpm test -- tests/roommate-dm.test.ts`

Expected: PASS with 5 tests.

- [ ] **Step 5: Review the task diff**

Run: `git diff --check && git diff -- lib/roommate-dm.ts tests/roommate-dm.test.ts components/sublet-app.tsx`

Expected: no whitespace errors and only storage-normalization changes beyond the carried-over DM work.

### Task 2: Enforce deep-link authorization and isolate composer drafts

**Files:**
- Modify: `lib/roommate-match-flow.ts`
- Modify: `tests/roommate-match-flow.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: `getAccessibleRoommateDmId(requestedId, connectionState)`.
- Produces: the requested ID only when `canOpenRoommateDm` is true; otherwise `null`.

- [ ] **Step 1: Add failing authorization tests**

```ts
it("rejects a roommate DM deep link until the relationship is mutual", () => {
  const oneWayState = {
    likedByMeIds: ["mia"],
    likedMeIds: [],
    introSentIds: [],
    roommateIds: []
  };

  expect(getAccessibleRoommateDmId("mia", oneWayState)).toBeNull();
  expect(getAccessibleRoommateDmId(null, oneWayState)).toBeNull();
});

it("accepts a roommate DM deep link for a mutual match", () => {
  expect(
    getAccessibleRoommateDmId("mia", {
      likedByMeIds: ["mia"],
      likedMeIds: ["mia"],
      introSentIds: [],
      roommateIds: []
    })
  ).toBe("mia");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm test -- tests/roommate-match-flow.test.ts`

Expected: FAIL because `getAccessibleRoommateDmId` is not exported.

- [ ] **Step 3: Add the minimal authorization helper**

```ts
export function getAccessibleRoommateDmId(
  requestedId: string | null | undefined,
  state: RoommateConnectionState
) {
  if (!requestedId) return null;
  return canOpenRoommateDm(requestedId, state) ? requestedId : null;
}
```

- [ ] **Step 4: Wire authorized derivation and draft isolation**

Import `getAccessibleRoommateDmId` in `components/sublet-app.tsx`, derive the active roommate from its result, and never build a thread for a rejected query target:

```ts
const accessibleRoommateDmId = useMemo(
  () => getAccessibleRoommateDmId(activeRoommateDmId, roommateConnectionState),
  [activeRoommateDmId, roommateConnectionState]
);
const activeRoommateDm = useMemo(
  () =>
    accessibleRoommateDmId
      ? apiRoommates.find((candidate) => getRoommateKey(candidate) === accessibleRoommateDmId) ?? null
      : null,
  [accessibleRoommateDmId, apiRoommates]
);
```

Give the composer a thread identity so React resets local draft state when the recipient changes:

```tsx
<RoommateDmPanel
  key={activeRoommateDmThread.id}
  roommate={activeRoommateDm}
  thread={activeRoommateDmThread}
  onSendMessage={(body) => onSendRoommateDm(activeRoommateDm, body)}
/>
```

Make the local-only delivery semantics explicit after appending a message:

```ts
setToast("Roommate DM 已保存到本地 Demo");
```

- [ ] **Step 5: Run focused tests and static checks**

Run: `pnpm test -- tests/roommate-match-flow.test.ts tests/roommate-dm.test.ts`

Expected: PASS with 10 tests after Tasks 1 and 2.

Run: `pnpm exec eslint components/sublet-app.tsx lib/roommate-match-flow.ts lib/roommate-dm.ts tests/roommate-match-flow.test.ts tests/roommate-dm.test.ts --max-warnings=0`

Expected: exit 0 with no warnings.

- [ ] **Step 6: Review the task diff**

Run: `git diff --check && git diff -- lib/roommate-match-flow.ts tests/roommate-match-flow.test.ts components/sublet-app.tsx`

Expected: no whitespace errors; a locked deep link cannot produce `activeRoommateDm` or a thread.

### Task 3: Verify the completed roommate DM flow

**Files:**
- Verify: `components/sublet-app.tsx`
- Verify: `lib/roommate-dm.ts`
- Verify: `lib/roommate-match-flow.ts`
- Verify: `tests/roommate-dm.test.ts`
- Verify: `tests/roommate-match-flow.test.ts`

**Interfaces:**
- Consumes: the complete local roommate match and DM flow.
- Produces: evidence that the targeted behavior, repository checks, production build, and browser interaction all work together.

- [ ] **Step 1: Run the related regression suite**

Run: `pnpm test -- tests/roommate-dm.test.ts tests/roommate-match-flow.test.ts tests/roommate-preferences.test.ts tests/match-demo.test.ts tests/app-routes.test.ts`

Expected: all selected tests pass.

- [ ] **Step 2: Run the full frontend check**

Run: `pnpm check`

Expected: ESLint, Next type generation, TypeScript, full Vitest suite, and production build all exit 0.

- [ ] **Step 3: Verify the browser flow**

Start `pnpm dev`, then verify:

1. A direct `/roommates?roommateId=<non-mutual>` URL does not show the `roommate-dm-panel`.
2. Liking a seeded incoming-like roommate opens the DM panel.
3. A typed message is trimmed, rendered on the right, and survives reload through localStorage.
4. Switching between two unlocked roommates does not carry an unsent draft to the new recipient.
5. A one-way match still cannot send or display private DM history.

- [ ] **Step 4: Inspect final scope and status**

Run: `git status --short && git diff --check && git diff --stat`

Expected: only the carried-over roommate DM files, the focused access/storage hardening files, and this plan are changed.

- [ ] **Step 5: Keep integration under user control**

Task-scoped commits may be created on the isolated `codex/roommate-dm-hardening` branch so each review has a stable diff. Do not merge or push the branch unless the user explicitly requests it.

Suggested final consolidation command if requested:

```bash
git add components/sublet-app.tsx lib/roommate-dm.ts lib/roommate-match-flow.ts tests/roommate-dm.test.ts tests/roommate-match-flow.test.ts docs/superpowers/plans/2026-07-10-roommate-dm-hardening.md
git commit -m "feat: finish mutual roommate dm"
```
