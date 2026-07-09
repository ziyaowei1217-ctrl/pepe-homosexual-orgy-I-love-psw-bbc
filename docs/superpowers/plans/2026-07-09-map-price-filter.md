# Map Price Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve Discover map interaction and price filtering so map markers, result cards, and empty states stay synchronized.

**Architecture:** Add pure price-filter helpers for min/max range behavior, update search insight copy to show a range, and enhance the existing OSM map component with selected marker state, stats, zoom controls, and marker-driven selection. Keep the current no-new-dependency map implementation.

**Tech Stack:** Next.js client component, React state, existing OSM tile helper, Vitest, Browser QA.

## Global Constraints

- Do not add a new map SDK or external dependency.
- Preserve existing Discover/List/Map surfaces and existing generated listings.
- Keep controls stable on mobile and desktop.
- Price filtering must drive both listing cards and map markers.

---

### Task 1: Price Filter Helpers

**Files:**
- Create: `lib/price-filter.ts`
- Create: `tests/price-filter.test.ts`
- Modify: `lib/search-insights.ts`
- Modify: `tests/search-insights.test.ts`

**Interfaces:**
- Produces: `PriceRangeFilter`, `filterListingsByPrice`, `formatPriceRangeLabel`, `normalizePriceRange`

- [ ] **Step 1: Write failing tests for min/max range labels and filtering.**
- [ ] **Step 2: Implement pure helper functions.**
- [ ] **Step 3: Update search insight chips to use price range labels.**

### Task 2: Discover UI and Map

**Files:**
- Modify: `app/page.tsx`
- Modify: `lib/listing-map.ts`
- Modify: `tests/listing-map.test.ts`

**Interfaces:**
- Consumes: `SearchFilters.priceMin`, `SearchFilters.priceMax`
- Produces: dual price inputs, quick max buttons, selected map markers, map stats, zoom/reset controls

- [ ] **Step 1: Update `SearchFilters` and filtering logic.**
- [ ] **Step 2: Replace budget slider UI with min/max + max slider + quick buttons.**
- [ ] **Step 3: Add map marker selection styling and map stats.**
- [ ] **Step 4: Add zoom controls and reset behavior.**

### Task 3: Verification

**Files:**
- Test: `tests/price-filter.test.ts`
- Test: `tests/search-insights.test.ts`
- Test: `tests/listing-map.test.ts`

- [ ] **Step 1: Run `pnpm test tests/price-filter.test.ts tests/search-insights.test.ts tests/listing-map.test.ts`.**
- [ ] **Step 2: Run `pnpm check`.**
- [ ] **Step 3: Browser QA the Discover map and price filter interaction.**
