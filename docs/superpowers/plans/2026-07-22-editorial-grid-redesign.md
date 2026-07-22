# Editorial Grid Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign every top-level renter and host screen with the approved editorial 12/8/4 grid language while preserving all current behavior, routes, copy, and data.

**Architecture:** Extend the existing shared CSS utilities and UI primitives, then restyle the existing screen functions in `components/sublet-app.tsx` without moving business logic. Structural source tests protect the visual contracts, while the existing behavior suite protects routing, persistence, matching, messaging, tours, and applications.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Vitest, Playwright CLI.

## Global Constraints

- Do not add a dependency.
- Do not add, remove, rename, disable, or reorder any product action.
- Do not change routes, query parameters, storage keys, API calls, seeded data, or product copy.
- Preserve the existing `/messages` narrow-pane behavior exactly.
- Preserve every existing component prop, callback, state transition, ref, and accessible label.
- Desktop at 1280px and above uses 12 columns with 24px gutters and up to 1440px content width.
- Tablet from 768px through 1279px uses 8 columns with 20px gutters.
- Mobile below 768px uses 4 columns with 16px gutters.
- Every structural contract begins with a failing Vitest assertion.

---

### Task 1: Editorial Tokens and Shared Primitives

**Files:**
- Create: `tests/editorial-grid.test.ts`
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`
- Modify: `components/ui/button.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/input.tsx`

**Interfaces:**
- Produces: `.editorial-kicker`, `.editorial-title`, `.editorial-toolbar`, `.editorial-context-strip`, `.editorial-field`, and `.editorial-panel` CSS utilities.
- Produces: neutral Card, Button, and Input presentation while retaining the current exported React interfaces.
- Consumes: existing `.app-shell`, `.app-grid`, `.app-section`, and `.app-card-grid` utilities.

- [ ] **Step 1: Write the failing editorial-token test**

Create `tests/editorial-grid.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("editorial grid redesign", () => {
  it("defines the approved editorial layout utilities", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const selector of [
      ".editorial-kicker",
      ".editorial-title",
      ".editorial-toolbar",
      ".editorial-context-strip",
      ".editorial-field",
      ".editorial-panel"
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).not.toContain("background-size: 64px 64px");
  });

  it("uses the neutral editorial primitive treatment", () => {
    const button = readFileSync("components/ui/button.tsx", "utf8");
    const card = readFileSync("components/ui/card.tsx", "utf8");
    const input = readFileSync("components/ui/input.tsx", "utf8");
    expect(button).toContain("rounded-[12px]");
    expect(button).toContain("bg-primary text-primary-foreground");
    expect(card).toContain("rounded-[18px]");
    expect(card).toContain("shadow-card");
    expect(input).toContain("rounded-[12px]");
    expect(input).toContain("bg-card");
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/editorial-grid.test.ts`

Expected: FAIL because the editorial selectors and primitive contracts are absent.

- [ ] **Step 3: Implement the global editorial tokens**

In `app/globals.css`, change the base color values to a warm neutral foundation and remove the body grid image:

```css
:root {
  --background: 40 20% 97%;
  --foreground: 220 24% 9%;
  --card: 0 0% 100%;
  --card-foreground: 220 24% 9%;
  --popover: 0 0% 100%;
  --popover-foreground: 220 24% 9%;
  --primary: 220 24% 9%;
  --primary-foreground: 0 0% 100%;
  --secondary: 214 55% 95%;
  --secondary-foreground: 220 24% 12%;
  --muted: 40 12% 93%;
  --muted-foreground: 218 10% 42%;
  --accent: 215 100% 50%;
  --accent-foreground: 0 0% 100%;
  --destructive: 9 76% 48%;
  --destructive-foreground: 0 0% 100%;
  --border: 216 18% 86%;
  --input: 216 18% 84%;
  --ring: 215 100% 50%;
  --radius: 18px;
}

body {
  @apply bg-background text-foreground antialiased;
  font-family: "Inter", "Geist", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans CJK SC", sans-serif;
  font-feature-settings: "cv02", "cv03", "cv04", "ss01";
  letter-spacing: 0;
  overflow-x: hidden;
}
```

Add these component utilities after the current app-grid utilities:

```css
.editorial-kicker {
  @apply text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground;
}

.editorial-title {
  @apply text-balance text-[clamp(2rem,4vw,4.75rem)] font-black leading-[0.94] tracking-[-0.045em] text-foreground;
}

.editorial-toolbar {
  @apply flex min-w-0 flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between;
}

.editorial-context-strip {
  @apply grid min-w-0 gap-3 border-y border-border bg-secondary/65 px-4 py-3 md:grid-cols-8 md:px-5 xl:grid-cols-12 xl:px-6;
}

.editorial-field {
  @apply flex min-w-0 flex-col gap-2 text-sm font-semibold text-foreground;
}

.editorial-panel {
  @apply min-w-0 rounded-[18px] border border-border bg-card shadow-card;
}
```

- [ ] **Step 4: Normalize elevation and UI primitives**

In `tailwind.config.ts`, set:

```ts
boxShadow: {
  panel: "0 18px 48px rgba(20, 26, 38, 0.07)",
  card: "0 8px 24px rgba(20, 26, 38, 0.055)"
}
```

In `components/ui/button.tsx`, use this base and preserve the current variant names and exports:

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-semibold transition-[background-color,color,border-color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/88",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/76",
        outline: "border border-input bg-card text-foreground hover:border-foreground/20 hover:bg-muted/55",
        ghost: "text-foreground hover:bg-muted/70",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        trust: "bg-accent text-accent-foreground hover:bg-trust-blue",
        reject: "border border-trust-red/25 bg-card text-trust-red hover:bg-trust-red hover:text-white",
        accept: "border border-trust-green/25 bg-card text-trust-green hover:bg-trust-green hover:text-white"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-[10px] px-3 text-xs",
        lg: "h-11 px-5",
        icon: "size-10",
        iconLg: "size-12"
      }
    },
    defaultVariants: { variant: "default", size: "default" }
  }
);
```

Change the Card shell to `rounded-[18px] border-border shadow-card`, keep responsive padding, and change Input to:

```tsx
"flex h-11 w-full rounded-[12px] border border-input bg-card px-3 py-2 text-sm font-medium ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
```

- [ ] **Step 5: Run focused and primitive behavior tests**

Run: `pnpm vitest run tests/editorial-grid.test.ts tests/grid-system.test.ts tests/auth-session.test.ts`

Expected: PASS with all existing component contracts intact.

- [ ] **Step 6: Commit the editorial foundation**

```bash
git add app/globals.css tailwind.config.ts components/ui/button.tsx components/ui/card.tsx components/ui/input.tsx tests/editorial-grid.test.ts
git commit -m "style: establish editorial visual system"
```

---

### Task 2: Global Header, Stay, and Listing Cards

**Files:**
- Modify: `tests/editorial-grid.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: editorial utilities from Task 1.
- Produces: the approved Stay reference treatment and reusable listing-card presentation.
- Preserves: `AppHeader`, `DiscoverScreen`, `SearchHero`, `ListingGrid`, and `ListingCard` props and callback behavior.

- [ ] **Step 1: Add failing source-contract tests**

Append to `tests/editorial-grid.test.ts`:

```ts
it("applies the editorial language to the global shell and Stay", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  expect(source).toContain("01 / Stay");
  expect(source).toContain("02 / Discover");
  expect(source).toContain("editorial-context-strip");
  expect(source).toContain("xl:col-span-7");
  expect(source).toContain("xl:col-span-5");
  expect(source).toContain("rounded-[18px]");
});

it("uses aligned editorial listing cards", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  expect(source).toContain("aspect-[16/11]");
  expect(source).toContain("border-t border-border");
  expect(source).toContain("mt-auto");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/editorial-grid.test.ts`

Expected: FAIL on the new Stay and listing-card strings.

- [ ] **Step 3: Restyle the global header**

In `AppHeader`, retain the existing items and callbacks but apply these contracts:

```tsx
<header className="sticky top-0 z-30 border-b border-border bg-background/92 backdrop-blur-xl">
  <div className="app-shell grid min-h-[72px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:gap-6">
```

Use `md:col-span-2 xl:col-span-3` for the brand, `md:col-span-5 xl:col-span-6` for primary navigation, and `md:col-span-1 xl:col-span-3` for account actions. Active navigation uses `variant="default"`; inactive navigation uses `variant="ghost"`. Remove the active underline while retaining the current label, icon, and click callback.

- [ ] **Step 4: Convert SearchHero into the approved editorial workspace**

Keep every current field and filter handler. Apply:

```tsx
<Card className="overflow-hidden rounded-[18px] border-border bg-card shadow-panel">
  <CardContent className="grid grid-cols-4 gap-4 p-4 md:grid-cols-8 md:gap-5 md:p-5 xl:grid-cols-12 xl:gap-6 xl:p-6">
```

Place a heading block with `<span className="editorial-kicker">01 / Stay</span>` and the existing search purpose copy in `col-span-4 md:col-span-8 xl:col-span-3`. Destination spans `col-span-4 xl:col-span-3`, dates span `col-span-4 xl:col-span-3`, price spans `col-span-4 md:col-span-4 xl:col-span-2`, and reset spans `col-span-4 md:col-span-4 xl:col-span-1`.

Move the current quick filters, match count, and match summary into one `editorial-context-strip` immediately after the search card. Keep their current order and callbacks.

- [ ] **Step 5: Apply the Stay workspace hierarchy**

In `DiscoverScreen`, use the existing `app-shell` and `app-grid`. Add this toolbar above inventory:

```tsx
<div className="editorial-toolbar">
  <div className="min-w-0">
    <span className="editorial-kicker">02 / Discover</span>
    <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] md:text-4xl">{filters.city} 短租发现</h1>
  </div>
</div>
```

Keep the current match count, dates, Roommates entry, and map/list tabs inside the toolbar. Preserve the existing map-mode split: inventory `lg:col-span-4 xl:col-span-7`; map `lg:col-span-4 xl:col-span-5`.

- [ ] **Step 6: Restyle ListingCard without changing behavior**

Use `aspect-[16/11]` media, `rounded-[18px]`, neutral border, shallower hover elevation, and a flex body. Keep all image, carousel, favorite, selection, and detail callbacks. Structure the body so the existing detail button sits in:

```tsx
<div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-3">
```

Keep the existing button label and handler. Do not change listing title, location, price, tags, ratings, or IDs.

- [ ] **Step 7: Run focused and Stay workflow tests**

Run: `pnpm vitest run tests/editorial-grid.test.ts tests/grid-system.test.ts tests/listing-selection.test.ts tests/listing-map.test.ts tests/listing-detail.test.ts tests/price-filter.test.ts tests/date-range.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the Stay reference**

```bash
git add components/sublet-app.tsx tests/editorial-grid.test.ts
git commit -m "style: redesign stay discovery workspace"
```

---

### Task 3: Listing Detail, Roommates, and Like Queue

**Files:**
- Modify: `tests/editorial-grid.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: Task 1 editorial utilities and Task 2 card treatment.
- Produces: editorial 8/4 detail, 4/8 roommate, and three-column queue templates.
- Preserves: listing actions, preference ranking, Like/Later/Pass, group decisions, and roommate DM routing.

- [ ] **Step 1: Add failing workspace tests**

Append:

```ts
it("labels the detail and roommate editorial workspaces", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  for (const label of ["01 / Listing", "01 / Roommates", "01 / Like Queue"]) {
    expect(source).toContain(label);
  }
  expect(source).toContain("xl:col-span-4 xl:sticky xl:top-24");
  expect(source).toContain("xl:grid-cols-3");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/editorial-grid.test.ts`

Expected: FAIL because the editorial workspace labels and sticky action contract are absent.

- [ ] **Step 3: Redesign ListingDetailScreen**

Keep the existing `app-shell app-grid` section. Add a full-span toolbar labeled `01 / Listing`, retain the back action and title context, and use:

```tsx
<div className="col-span-full flex min-w-0 flex-col gap-5 xl:col-span-8">
<aside className="col-span-full flex min-w-0 flex-col gap-4 xl:col-span-4 xl:sticky xl:top-24">
```

Apply neutral panels, stronger title/price hierarchy, and border-separated fact groups. Preserve the current media, saved, landlord DM, tour, application, and roommate buttons in their current order.

- [ ] **Step 4: Redesign RoommatesMarketplaceScreen**

Add `01 / Roommates` above the existing `Roommate Match` title. Remove decorative path graphics from the visual hierarchy by keeping them hidden at all breakpoints. Use a 4/8 desktop grid: preference wrapper `xl:col-span-4`, discovery wrapper `xl:col-span-8`. Restyle preference summaries as border-separated rows and candidate cards as neutral editorial panels. Keep every preference update and queue callback unchanged.

- [ ] **Step 5: Redesign LikeQueueScreen**

Add `01 / Like Queue` to the existing page header. Use:

```tsx
<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
```

Give each `QueueColumn` an editorial heading, count, and neutral list treatment. Preserve the existing waiting, mutual, and group member classification and actions.

- [ ] **Step 6: Run focused roommate and detail tests**

Run: `pnpm vitest run tests/editorial-grid.test.ts tests/listing-detail.test.ts tests/roommate-preferences.test.ts tests/roommate-match-flow.test.ts tests/roommate-queue.test.ts tests/roommate-dm.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit these workspaces**

```bash
git add components/sublet-app.tsx tests/editorial-grid.test.ts
git commit -m "style: redesign listing and roommate workspaces"
```

---

### Task 4: Messages, Trips, Publish, Trust, and Authentication

**Files:**
- Modify: `tests/editorial-grid.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: editorial tokens and shared panels from Tasks 1–3.
- Produces: consistent supporting workspaces across the remaining top-level routes.
- Preserves: Messages panes, composer behavior, trips/applications, listing publishing, trust actions, and authentication.

- [ ] **Step 1: Add failing remaining-screen tests**

Append:

```ts
it("labels every supporting editorial workspace", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  for (const label of [
    "01 / Messages",
    "01 / Trips",
    "01 / Publish",
    "01 / Trust",
    "01 / Account"
  ]) {
    expect(source).toContain(label);
  }
  expect(source).toContain("xl:col-span-3");
  expect(source).toContain("xl:col-span-9");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/editorial-grid.test.ts`

Expected: FAIL on the new labels.

- [ ] **Step 3: Redesign MessagesScreen**

Keep the current conditional visibility expressions exactly. Add a full-span compact workspace label inside the visible pane: `01 / Messages`. Desktop remains contacts `xl:col-span-3` and conversation `xl:col-span-9`; retain the current `lg` spans so 1024px behavior does not regress. Restyle contacts as border-separated rows, conversation header as `editorial-toolbar`, messages as a readable vertical timeline, and composer as a neutral bordered action row.

- [ ] **Step 4: Redesign TripsScreen**

Add `01 / Trips`. Preserve the 4/8 grid and all conditional application content. Restyle the summary and detail regions with neutral panels, editorial status headings, and border-separated progress sections. Do not change `onAdvance`, application lookup, trip data, or empty-state actions.

- [ ] **Step 5: Redesign PublishScreen and AuthStrip**

Add `01 / Publish` to Publish and `01 / Account` to AuthStrip. Preserve the 8/4 layout and existing form/publishing callbacks. Make the main publishing flow an editorial step list and the sidebar a compact status/review column. AuthStrip uses a neutral section with a concise heading and existing email/code controls; do not change sign-in requests or local-demo behavior.

- [ ] **Step 6: Redesign TrustScreen**

Add `01 / Trust`. Preserve the 8/4 grid and operations callbacks. Use the main eight columns for trust mechanism content and the four-column sidebar for the queue. Replace decorative blue emphasis with neutral panels plus status-specific green, amber, and red accents only where the current state requires them.

- [ ] **Step 7: Run focused and workflow tests**

Run: `pnpm vitest run tests/editorial-grid.test.ts tests/message-inbox.test.ts tests/roommate-dm.test.ts tests/local-workflow.test.ts tests/deal-workflow.test.ts tests/landlord-listings.test.ts tests/auth-session.test.ts tests/notification-center.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the supporting workspaces**

```bash
git add components/sublet-app.tsx tests/editorial-grid.test.ts
git commit -m "style: unify editorial supporting workspaces"
```

---

### Task 5: Full Verification and Responsive Quality Pass

**Files:**
- Verify: `app/globals.css`
- Verify: `tailwind.config.ts`
- Verify: `components/sublet-app.tsx`
- Verify: `components/ui/button.tsx`
- Verify: `components/ui/card.tsx`
- Verify: `components/ui/input.tsx`
- Verify: `tests/editorial-grid.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified branch with responsive visual evidence and unchanged product behavior.

- [ ] **Step 1: Run the complete automated check**

Run: `pnpm check`

Expected: lint, typecheck, every Vitest file, and the Next.js production build exit with code 0.

- [ ] **Step 2: Start the website on port 3002**

Run: `pnpm dev --port 3002`

Expected: `http://127.0.0.1:3002/` returns HTTP 200.

- [ ] **Step 3: Verify all routes at four viewport sizes**

Inspect `/`, `/?listingId=1`, `/roommates`, `/roommates/likes`, `/messages`, `/trips`, `/host/listings`, and `/admin/trust` at 1440x1000, 1024x900, 768x1000, and 390x844.

For every combination, record `document.documentElement.scrollWidth`, `clientWidth`, visible `.app-grid` child widths, and clipped interactive controls. Expected: no horizontal document overflow, no clipped button/input/link, and grid proportions matching the design.

- [ ] **Step 4: Verify critical interactions**

Exercise the existing UI controls in this order:

1. toggle one listing favorite and confirm its accessible label changes;
2. open a listing and confirm the `listingId` query parameter;
3. open landlord DM and confirm `/messages?listingId=...`;
4. open tour entry and confirm `tour=1`;
5. use Roommate Later and Like;
6. confirm roommate DM routes to `/messages?roommateId=...`;
7. at 390px confirm `/messages` shows contacts and a targeted URL shows the conversation plus return control.

Expected: destinations and local state match the pre-redesign behavior.

- [ ] **Step 5: Check console and final diff**

With the four read-only API requests mocked to empty arrays when the local API is unavailable, confirm zero frontend console errors. Then run:

```bash
git diff --check main...HEAD
git diff --stat main...HEAD
git diff main...HEAD -- app/globals.css tailwind.config.ts components/sublet-app.tsx components/ui/button.tsx components/ui/card.tsx components/ui/input.tsx tests/editorial-grid.test.ts
```

Expected: only presentation, layout tests, and design/plan documents differ; no product callback, route, data, copy, or API changes.

- [ ] **Step 6: Commit browser-only corrections if needed**

If verification requires presentation-only corrections, stage only the seven implementation files and commit:

```bash
git add app/globals.css tailwind.config.ts components/sublet-app.tsx components/ui/button.tsx components/ui/card.tsx components/ui/input.tsx tests/editorial-grid.test.ts
git commit -m "fix: polish editorial responsive layouts"
```

If no correction is needed, do not create an empty commit.
