# Roommate-First Commercial Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a roommate-first commercial demo where the primary screen is a swipe-driven roommate match workspace with match-fit scoring, recommended homes, a deal room rail, and a group-tour CTA.

**Architecture:** Keep backend scope unchanged. Add a pure TypeScript recommendation module under `lib/`, test it with a compile-and-run Node test flow, then render the new commercial workspace from a focused React component consumed by `app/page.tsx`.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, shadcn-style local UI components, lucide-react icons, Node built-in test runner.

---

## File Structure

- Create `lib/match-demo.ts`: pure helper module for budget parsing, match-fit scoring, recommended listings, and deal-room copy.
- Create `tests/match-demo.test.ts`: Node test file compiled with TypeScript before execution.
- Create `components/roommate-first-workspace.tsx`: the C2/A commercial demo workspace UI.
- Modify `app/page.tsx`: make `Roommates` the default section, rename the primary section label to `Match`, wire the new workspace into the existing state, and keep Discover/Groups/Publish/Trips/Trust available.
- Optionally modify `app/globals.css`: only if responsive or typography polish needs shared utility support.

## Design Inventory

- Concept reference: `docs/superpowers/specs/assets/roommate-first-commercial-demo-concept.png`.
- First viewport: three-column app workspace, not a marketing hero.
- Copy to preserve or closely mirror: `Sublet Pipeline`, `Roommate Match`, `Deal Room`, `89% Match`, `Shared budget`, `Recommended homes`, `Trust checklist`, `Request group tour`.
- Container model: large media card, white panels, map/list center panel, right conversion rail. Avoid nested card stacks.
- Palette: cool near-white background, white surfaces, deep navy text, teal/sky primary, green trust accent, coral reject.

## Task 1: Match Demo Data Layer

**Files:**
- Create: `tests/match-demo.test.ts`
- Create: `lib/match-demo.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/match-demo.test.ts` with tests for budget parsing, match fit, recommendations, and deal room generation:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDealRoom,
  buildMatchFit,
  getBudgetNumber,
  recommendListingsForRoommate,
  type DemoListing,
  type DemoRoommate
} from "../lib/match-demo";

const roommate: DemoRoommate = {
  id: "roommate-1",
  name: "Jasmine",
  age: 23,
  role: "Northeastern University - MS Data Science",
  image: "https://example.com/jasmine.jpg",
  match: 89,
  budget: "$1,600/月",
  commute: "Back Bay / Fenway",
  tags: ["Clean", "Early riser", "No smoking", "Study focused"]
};

const groupMembers: DemoRoommate[] = [
  {
    id: "roommate-2",
    name: "Alex",
    age: 24,
    role: "Northeastern University - MS Data Science",
    image: "https://example.com/alex.jpg",
    match: 92,
    budget: "$1,400/月",
    commute: "Back Bay",
    tags: ["Clean", "Study focused", "Gym 3-4x/week"]
  }
];

const listings: DemoListing[] = [
  {
    id: "listing-1",
    title: "Back Bay 2B1B Furnished",
    area: "Boston - Back Bay",
    image: "https://example.com/back-bay.jpg",
    price: 1550,
    originalPrice: 1800,
    beds: 2,
    baths: 1,
    commute: "8 min walk to T",
    transit: "Back Bay station",
    trust: "Verified listing - landlord aware",
    tags: ["Group 推荐", "视频验房", "房东知情"],
    score: 4.9
  },
  {
    id: "listing-2",
    title: "Luxury Studio",
    area: "Boston - Seaport",
    image: "https://example.com/studio.jpg",
    price: 3100,
    originalPrice: 3300,
    beds: 1,
    baths: 1,
    commute: "25 min by transit",
    transit: "Silver line",
    trust: "Unverified",
    tags: ["Studio"],
    score: 4.5
  }
];

test("parses roommate budget strings into monthly numbers", () => {
  assert.equal(getBudgetNumber(roommate), 1600);
});

test("builds match fit with budget, commute, lifestyle, and trust scores", () => {
  const fit = buildMatchFit(roommate, listings, groupMembers);

  assert.equal(fit.overall, 89);
  assert.equal(fit.sharedBudgetLabel, "$1,400 - $1,600 / person");
  assert.equal(fit.metrics.map((metric) => metric.label).join(","), "Budget overlap,Commute overlap,Lifestyle compatibility,Trust status");
  assert.ok(fit.metrics.every((metric) => metric.score >= 80));
});

test("recommends group-suitable homes before poor fits", () => {
  const recommended = recommendListingsForRoommate(roommate, listings, groupMembers);

  assert.equal(recommended[0].id, "listing-1");
  assert.equal(recommended[0].fitLabel, "Best match");
});

test("builds a deal room with group members, recommendations, messages, and pipeline", () => {
  const dealRoom = buildDealRoom(roommate, listings, groupMembers);

  assert.deepEqual(dealRoom.members.map((member) => member.name), ["Alex", "Jasmine"]);
  assert.equal(dealRoom.recommendedHomes[0].id, "listing-1");
  assert.equal(dealRoom.pipeline[0].status, "active");
  assert.equal(dealRoom.primaryCta, "Request group tour");
  assert.ok(dealRoom.messages[0].body.includes("Back Bay"));
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
rm -rf .tmp-tests && pnpm exec tsc tests/match-demo.test.ts lib/match-demo.ts --module commonjs --target ES2022 --moduleResolution node --esModuleInterop --types node --skipLibCheck --outDir .tmp-tests && node --test .tmp-tests/tests/match-demo.test.js
```

Expected: fail because `lib/match-demo.ts` does not exist yet.

- [ ] **Step 3: Implement the helper module**

Create `lib/match-demo.ts` with exported `DemoRoommate`, `DemoListing`, `MatchFit`, `RecommendedListing`, `DealRoom`, `getBudgetNumber`, `buildMatchFit`, `recommendListingsForRoommate`, and `buildDealRoom`. Use deterministic scoring based on parsed budgets, shared commute words, shared tags, and trust/listing tags.

- [ ] **Step 4: Run the test and verify GREEN**

Run the same compile-and-test command from Step 2.

Expected: all four tests pass.

## Task 2: Roommate-First Workspace UI

**Files:**
- Create: `components/roommate-first-workspace.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: Write the React integration shell**

Create `components/roommate-first-workspace.tsx` with a client component that accepts:

```ts
type RoommateFirstWorkspaceProps = {
  roommate: DemoRoommate;
  roommates: DemoRoommate[];
  listings: DemoListing[];
  groupMembers: DemoRoommate[];
  activeIndex: number;
  skippedCount: number;
  likedCount: number;
  favoriteIds: Set<string>;
  tourRequested: boolean;
  onReject: () => void;
  onLater: () => void;
  onLike: () => void;
  onFavoriteListing: (id: string) => void;
  onSelectListing: (listing: DemoListing) => void;
  onRequestTour: () => void;
  onOpenDiscover: () => void;
};
```

Render the concept structure: swipe card, match-fit summary, recommended homes map/list, pipeline, group rail, shared budget, message preview, trust checklist, and CTA.

- [ ] **Step 2: Wire it into `app/page.tsx`**

Modify `AppSection` so the roommate-first screen is the default commercial screen. Rename the visible nav label from `Roommates` to `Match` while keeping the section key stable if that minimizes edits. Pass existing local handlers and data into `RoommateFirstWorkspace`.

- [ ] **Step 3: Preserve existing fallback screens**

Keep Discover, Groups, Publish, Trips, and Trust reachable through nav. Existing `RoommatesScreen` can remain in the file if useful, but the user-facing primary `Roommates`/`Match` section should render the new commercial workspace.

- [ ] **Step 4: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: TypeScript exits 0.

## Task 3: Visual Polish And Responsive QA

**Files:**
- Modify: `components/roommate-first-workspace.tsx`
- Modify: `app/page.tsx` if required
- Modify: `app/globals.css` only if a shared style utility is required

- [ ] **Step 1: Start the dev server**

Run:

```bash
pnpm dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Browser QA desktop**

Verify:

- First viewport shows roommate-first workspace.
- Pass/Later/Like update state and toast.
- Like adds the roommate into the group rail.
- Recommended homes update when active roommate changes.
- Request group tour changes visible CTA state/toast.

- [ ] **Step 3: Browser QA mobile**

Set mobile viewport and verify:

- No horizontal overflow.
- Roommate card, match summary, recommended homes, and CTA stack in a readable order.
- Buttons remain tappable.
- Long titles and tags do not overflow.

- [ ] **Step 4: Production verification**

Run:

```bash
pnpm typecheck
pnpm build
rm -rf .tmp-tests && pnpm exec tsc tests/match-demo.test.ts lib/match-demo.ts --module commonjs --target ES2022 --moduleResolution node --esModuleInterop --types node --skipLibCheck --outDir .tmp-tests && node --test .tmp-tests/tests/match-demo.test.js
```

Expected: all commands exit 0.

## Self-Review Checklist

- Spec coverage: Task 1 covers match/recommendation helpers; Task 2 covers roommate-first C2 workspace; Task 3 covers visual, responsive, and interaction verification.
- Placeholder scan: no intentionally deferred implementation steps or undefined future tasks.
- Type consistency: `DemoRoommate` and `DemoListing` are shared between the helper and workspace component so UI and tests use the same fields.
