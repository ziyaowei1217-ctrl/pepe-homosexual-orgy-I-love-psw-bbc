# Grid System Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one balanced 12/8/4-column responsive grid and visual rhythm to every top-level screen without changing any product behavior.

**Architecture:** Define shared grid and panel utilities in `app/globals.css`, then replace one-off page containers and column templates in `components/sublet-app.tsx`. Keep all existing component boundaries, props, callbacks, state, routes, copy, and data intact; only shared UI primitives and class strings change.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 3, Vitest, browser-client Playwright API.

## Global Constraints

- The work is visual only: existing workflows, routes, state, copy, data, and button behavior must remain unchanged.
- Desktop at 1280px and above uses 12 columns with 24px gutters and up to 1440px content width.
- Tablet from 768px through 1279px uses 8 columns with 20px gutters.
- Mobile below 768px uses 4 columns with 16px gutters.
- No product action may be added, removed, renamed, disabled, or reordered.
- No dependency may be added.
- Existing Messages narrow-screen pane behavior remains unchanged.
- Every production behavior or structural contract change begins with a failing Vitest test.

---

### Task 1: Shared grid foundation

**Files:**
- Create: `tests/grid-system.test.ts`
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: `.app-shell`, `.app-grid`, `.app-section`, `.app-panel`, and `.app-card-grid` layout utilities.
- Consumes: existing Tailwind breakpoints and theme tokens.

- [ ] **Step 1: Write the failing grid-token test**

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("responsive grid system", () => {
  it("defines shared shell, grid, section, panel, and card-grid utilities", () => {
    const css = readFileSync("app/globals.css", "utf8");

    for (const selector of [".app-shell", ".app-grid", ".app-section", ".app-panel", ".app-card-grid"]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("max-w-[1440px]");
    expect(css).toContain("grid-cols-4");
    expect(css).toContain("md:grid-cols-8");
    expect(css).toContain("xl:grid-cols-12");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm vitest run tests/grid-system.test.ts`

Expected: FAIL because the shared selectors do not exist.

- [ ] **Step 3: Add the shared utilities**

Add this component layer to `app/globals.css`:

```css
@layer components {
  .app-shell {
    @apply mx-auto w-full max-w-[1440px] px-4 md:px-5 xl:px-6;
  }

  .app-grid {
    @apply grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:gap-6;
  }

  .app-section {
    @apply col-span-full min-w-0;
  }

  .app-panel {
    @apply rounded-[20px] border border-blue-100 bg-white p-4 shadow-panel md:p-5 xl:p-6;
  }

  .app-card-grid {
    @apply grid grid-cols-1 gap-4 sm:grid-cols-2 xl:gap-6;
  }
}
```

Update the theme elevation in `tailwind.config.ts`:

```ts
boxShadow: {
  panel: "0 12px 32px rgba(0, 34, 68, 0.065)",
  card: "0 8px 22px rgba(0, 34, 68, 0.085)"
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm vitest run tests/grid-system.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the foundation**

```bash
git add app/globals.css tailwind.config.ts tests/grid-system.test.ts
git commit -m "style: add responsive grid foundation"
```

---

### Task 2: Global shell, Stay, and listing cards

**Files:**
- Modify: `tests/grid-system.test.ts`
- Modify: `components/sublet-app.tsx`

**Interfaces:**
- Consumes: `.app-shell`, `.app-grid`, `.app-section`, and `.app-card-grid` from Task 1.
- Produces: aligned header, filter area, inventory/map workspace, listing cards, and listing detail template.

- [ ] **Step 1: Add failing structural usage tests**

Append to `tests/grid-system.test.ts`:

```ts
it("uses the shared shell throughout the application", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  expect((source.match(/app-shell/g) ?? []).length).toBeGreaterThanOrEqual(8);
  expect(source).toContain("xl:col-span-7");
  expect(source).toContain("xl:col-span-5");
  expect(source).toContain("xl:col-span-8");
  expect(source).toContain("xl:col-span-4");
});

it("keeps listing cards on the shared card grid", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  expect(source).toContain("app-card-grid");
  expect(source).toContain("aspect-[4/3]");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/grid-system.test.ts`

Expected: FAIL because the application has not adopted the utilities.

- [ ] **Step 3: Convert the header to the shared shell**

Use this grid contract for the header wrapper and its three existing children:

```tsx
<div className="app-shell grid h-[76px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:gap-6">
  <div className="min-w-0 md:col-span-2 xl:col-span-3">{/* existing brand */}</div>
  <nav className="hidden min-w-0 items-center justify-center gap-1 md:col-span-5 md:flex xl:col-span-6 xl:gap-2">
    {/* existing navigation buttons unchanged */}
  </nav>
  <div className="flex min-w-0 items-center justify-end gap-2 md:col-span-1 xl:col-span-3">
    {/* existing account actions unchanged */}
  </div>
</div>
```

Keep the existing mobile navigation row and change only its outer wrapper to `app-shell`.

- [ ] **Step 4: Convert Stay and its filter area**

Use the following outer templates without changing child controls or callbacks:

```tsx
<section className="app-shell flex w-full flex-col gap-6 py-5 md:py-6">
  <SearchAndFilterPanel className="app-section" />
  <div className="app-grid items-start">
    <div className="col-span-full min-w-0 xl:col-span-7">{/* inventory */}</div>
    <div className="col-span-full min-w-0 xl:col-span-5">{/* map/detail */}</div>
  </div>
</section>
```

Inside the filter card, use a 12-column desktop form grid:

```tsx
<div className="grid grid-cols-4 gap-4 md:grid-cols-8 md:gap-5 xl:grid-cols-12 xl:items-end xl:gap-6">
  <label className="col-span-4 xl:col-span-4">{/* destination */}</label>
  <div className="col-span-4 grid grid-cols-2 gap-3 xl:col-span-4">{/* dates */}</div>
  <div className="col-span-4 xl:col-span-3">{/* price */}</div>
  <Button className="col-span-4 xl:col-span-1">重置</Button>
</div>
```

- [ ] **Step 5: Align listing cards and listing detail**

Replace the listing collection wrapper with `app-card-grid`. Give listing media `aspect-[4/3]` and make the card body a flex column whose existing action row uses `mt-auto`. Convert listing detail to:

```tsx
<section className="app-shell app-grid items-start py-5 md:py-6">
  <div className="col-span-full min-w-0 xl:col-span-8">{/* existing detail content */}</div>
  <aside className="col-span-full min-w-0 xl:col-span-4">{/* existing application flow */}</aside>
</section>
```

- [ ] **Step 6: Run focused and behavior tests**

Run: `pnpm vitest run tests/grid-system.test.ts tests/listing-selection.test.ts tests/listing-map.test.ts tests/listing-detail.test.ts`

Expected: PASS with no behavior assertion changes.

- [ ] **Step 7: Commit Stay and shell layout**

```bash
git add components/sublet-app.tsx tests/grid-system.test.ts
git commit -m "style: align stay and listing layouts"
```

---

### Task 3: Remaining workspace templates and visual hierarchy

**Files:**
- Modify: `tests/grid-system.test.ts`
- Modify: `components/sublet-app.tsx`
- Modify: `components/ui/card.tsx`
- Modify: `components/ui/button.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: shared grid utilities from Task 1.
- Produces: consistent Roommates, Like Queue, Messages, Trips, Publish, Trust, card, button, typography, and background presentation.

- [ ] **Step 1: Add failing workspace-template tests**

Append to `tests/grid-system.test.ts`:

```ts
it("defines the agreed workspace column templates", () => {
  const source = readFileSync("components/sublet-app.tsx", "utf8");
  for (const contract of [
    "xl:col-span-3",
    "xl:col-span-9",
    "lg:col-span-4",
    "xl:col-span-8",
    "xl:col-span-4"
  ]) {
    expect(source).toContain(contract);
  }
});

it("uses quieter shared card and control radii", () => {
  const card = readFileSync("components/ui/card.tsx", "utf8");
  const button = readFileSync("components/ui/button.tsx", "utf8");
  expect(card).toContain("rounded-[20px]");
  expect(button).toContain("rounded-[14px]");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run tests/grid-system.test.ts`

Expected: FAIL on missing workspace contracts and primitive radii.

- [ ] **Step 3: Apply the remaining page templates**

Use these exact outer grid contracts while leaving existing children and handlers in place:

```tsx
// Roommates
<section className="app-shell app-grid items-start py-5 md:py-6">
  <div className="col-span-full min-w-0 xl:col-span-8">{/* discovery */}</div>
  <aside className="col-span-full min-w-0 xl:col-span-4">{/* group/status */}</aside>
</section>

// Like Queue
<section className="app-shell py-5 md:py-6">
  <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">{/* existing columns */}</div>
</section>

// Messages
<section className="app-shell app-grid min-h-[calc(100vh-76px)] py-4 md:py-5">
  <aside className="col-span-full min-w-0 xl:col-span-3">{/* contacts */}</aside>
  <div className="col-span-full min-w-0 xl:col-span-9">{/* conversation */}</div>
</section>

// Publish and listing detail
<section className="app-shell app-grid items-start py-5 md:py-6">
  <div className="col-span-full min-w-0 xl:col-span-8">{/* primary */}</div>
  <aside className="col-span-full min-w-0 xl:col-span-4">{/* sidebar */}</aside>
</section>

// Trips
<section className="app-shell app-grid items-start py-5 md:py-6">
  <aside className="col-span-full min-w-0 lg:col-span-4">{/* summary */}</aside>
  <div className="col-span-full min-w-0 lg:col-span-4 xl:col-span-8">{/* detail */}</div>
</section>
```

Preserve the existing conditional classes that hide or show Messages panes below desktop width.

- [ ] **Step 4: Normalize visual primitives**

Change the default Card shell to:

```tsx
"w-full min-w-0 max-w-full rounded-[20px] border border-border bg-card text-card-foreground shadow-sm"
```

Use responsive card padding:

```tsx
<div ref={ref} className={cn("flex flex-col gap-1.5 p-4 md:p-5 xl:p-6", className)} {...props} />
<div ref={ref} className={cn("p-4 pt-0 md:p-5 md:pt-0 xl:p-6 xl:pt-0", className)} {...props} />
```

Change the Button base radius to `rounded-[14px]` while preserving variants, sizes, event forwarding, and focus classes. Keep badges unchanged.

Reduce the body grid opacity and enlarge its spacing:

```css
background-image:
  linear-gradient(rgba(0, 106, 255, 0.02) 1px, transparent 1px),
  linear-gradient(90deg, rgba(0, 106, 255, 0.02) 1px, transparent 1px);
background-size: 64px 64px;
```

- [ ] **Step 5: Run focused and workflow tests**

Run: `pnpm vitest run tests/grid-system.test.ts tests/message-inbox.test.ts tests/roommate-dm.test.ts tests/roommate-queue.test.ts tests/local-workflow.test.ts`

Expected: PASS with no workflow snapshot or behavior changes.

- [ ] **Step 6: Commit the remaining workspaces**

```bash
git add app/globals.css components/sublet-app.tsx components/ui/card.tsx components/ui/button.tsx tests/grid-system.test.ts
git commit -m "style: unify workspace grid templates"
```

---

### Task 4: Full validation and browser quality pass

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: all layout and visual changes from Tasks 1–3.
- Produces: a verified branch with unchanged functionality and responsive visual evidence.

- [ ] **Step 1: Stop the development server and run the full check**

Run: `pnpm check`

Expected: lint, typecheck, all Vitest files, and Next production build exit with code 0.

- [ ] **Step 2: Restart the website on port 3001**

Run: `pnpm dev --port 3001`

Expected: `http://127.0.0.1:3001/` responds with HTTP 200.

- [ ] **Step 3: Verify desktop and tablet layouts**

At 1440x1000 and 1024x900, inspect Stay, listing detail, Roommates, Like Queue, Messages, Trips, Publish, and Trust. Confirm common container edges, required column proportions, aligned cards, compact filters, no horizontal overflow, and no console errors.

- [ ] **Step 4: Verify narrow layouts**

At 768x1000 and 390x844, inspect the same routes. Confirm navigation readability, single-flow content order, no clipped controls, no horizontal overflow, and unchanged contacts/conversation behavior in Messages.

- [ ] **Step 5: Verify functional boundaries**

Exercise one existing route change, favorite toggle, Roommate Like/Later, landlord DM, roommate DM, and tour entry point. Confirm every action reaches the same destination or state as before the visual work.

- [ ] **Step 6: Review the final diff**

Run: `git diff main...HEAD -- app/globals.css tailwind.config.ts components/sublet-app.tsx components/ui/card.tsx components/ui/button.tsx tests/grid-system.test.ts`

Expected: only CSS, class strings, UI primitive presentation, and structural layout tests changed; no callback, route, data, or copy changes.

- [ ] **Step 7: Commit any browser-only corrections**

```bash
git add app/globals.css tailwind.config.ts components/sublet-app.tsx components/ui/card.tsx components/ui/button.tsx tests/grid-system.test.ts
git commit -m "fix: polish responsive grid breakpoints"
```
