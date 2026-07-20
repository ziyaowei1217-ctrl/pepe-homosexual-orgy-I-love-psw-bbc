# Grid System Refresh Design

## Goal

Make the entire renter and host interface feel coherent, balanced, and easier to scan by applying one responsive grid system and one spacing rhythm across every page. The work is visual only: existing workflows, routes, state, copy, data, and button behavior must remain unchanged.

## Current Layout Problems

- Page containers use several unrelated maximum widths, so headers, cards, maps, and sidebars do not share vertical alignment lines.
- Desktop layouts use one-off column widths and gaps, which makes transitions between Stay, Messages, Trips, Roommates, Publish, and listing detail feel inconsistent.
- The Stay filter panel occupies too much vertical space at tablet width and pushes inventory below the fold.
- Listing cards have inconsistent content heights, weakening horizontal and vertical alignment.
- Heavy font weights, large corner radii, shadows, and visible background grid lines compete for attention.
- At narrow widths, the brand, primary navigation, and account actions compete for the same horizontal space.

## Chosen Approach

Introduce shared layout utilities for a 12-column desktop grid, 8-column tablet grid, and 4-column mobile grid. Page components will consume these utilities through consistent container, grid, section, and card-shell classes. Existing component boundaries and event handlers remain intact.

This approach is intentionally narrower than rebuilding the component library. It creates a visible system without restructuring workflow code or changing product behavior.

## Grid Foundation

The global layout uses these fixed rules:

- Desktop at 1280px and above: 12 columns, 24px gutters, up to 1440px content width.
- Tablet from 768px through 1279px: 8 columns, 20px gutters.
- Mobile below 768px: 4 columns, 16px gutters.
- Outer padding: 16px on mobile, 20px on tablet, and 24px on desktop.
- Vertical rhythm: an 8px base with 16px, 24px, and 32px as the primary internal and sectional spacing values.

Reusable CSS utilities will define the container, responsive grid, common full-span section, and standard panel spacing. Tailwind classes remain available for page-specific column spans, but arbitrary container widths and inconsistent outer padding will be removed from the touched screens.

## Page Templates

### Global Header

The desktop header uses a 3/6/3 structure for brand, primary navigation, and account actions. Tablet uses a compact 2/5/1 allocation, allowing the brand description and secondary account labels to collapse before primary navigation becomes cramped. Mobile uses a compact top row plus the existing horizontal navigation row. No navigation destinations or actions change.

### Stay and Search

The search and filter area spans all columns. On desktop it uses two compact rows: search/date/price inputs first, followed by quick filters and the match summary. Tablet uses an 8-column arrangement that keeps destination full-width, dates paired, price controls paired, and actions aligned. Mobile becomes a 4-column single-flow layout.

The inventory workspace uses a 7/5 split on desktop and a 4/4 split on tablet. Listing cards use two equal columns inside the inventory area and a stable media ratio plus consistent information height. The existing map/list toggle, map markers, listing selection, favorite actions, and detail actions do not change.

### Listing Detail and Publish

Listing detail and Publish use an 8/4 desktop template. The main content holds media and primary information, while application or publishing controls occupy the sidebar. Tablet places the sidebar after the main content when the available width would make either column too narrow. Mobile remains single-column.

### Roommates and Like Queue

Roommates uses an 8/4 desktop layout for the primary discovery surface and supporting group/status information. Like Queue uses three equal four-column regions on desktop, two-column stacking at tablet width, and one column on mobile. Existing person classification, Like/Later behavior, group membership, and DM entry points remain untouched.

### Messages

Messages uses a 3/9 desktop split for contacts and the active conversation. The current narrow-screen behavior remains authoritative: `/messages` shows contacts and a targeted URL shows the conversation with a return control. The grid refresh changes only widths, spacing, and panel presentation.

### Trips, Trust, and Supporting Workspaces

Trips uses a 4/8 template for summary/navigation and detailed trip or application content. Trust and other supporting workspaces use either 8/4 or full-width sections according to their existing content hierarchy. No administrative action or application state changes.

## Visual Hierarchy

- Main panels use approximately 20px corner radii; controls use 12–16px; badges remain pill-shaped.
- Standard panel padding is 24px on desktop, 20px on tablet, and 16px on mobile.
- Display titles, section titles, prices, body copy, labels, and metadata use a consistent type hierarchy. Heavy weight is reserved for titles, prices, and primary actions rather than every line.
- Listing images use consistent aspect ratios and content areas use stable minimum heights to align action rows.
- Background grid lines become subtler. Shadows are reduced to one panel elevation and one floating elevation.
- Existing blue remains the primary accent; neutral cards become quieter so active controls and selected items carry the visual focus.

## Behavior and Data Boundaries

This work must not:

- add, remove, rename, disable, or reorder product actions;
- change routes or query parameters;
- change state transitions, storage, API calls, filters, messages, tours, applications, favorites, or roommate matching;
- change product copy or seeded data;
- introduce a new dependency.

Layout-only component extraction is allowed when it reduces repeated class strings, but business logic must remain in its current owner.

## Responsive Behavior

- At 1440px, the 12-column grid exposes the complete desktop hierarchy and keeps sidebars and maps visible.
- At 1024px, the 8-column grid prevents sidebars and card content from becoming cramped.
- At 768px, complex supporting content follows primary content and the existing Messages pane behavior remains unchanged.
- At 390px, the 4-column grid becomes a single reading flow with no horizontal overflow, clipped navigation, or inaccessible controls.

## Verification

Automated verification must preserve all existing tests, lint rules, TypeScript checks, and production build output. Layout utilities may receive focused structural tests if they expose pure mappings, but visual correctness is primarily verified in the browser.

Browser verification covers Stay, listing detail, Roommates, Like Queue, Messages, Trips, Publish, and Trust at 1440px, 1024px, 768px, and 390px. The pass checks:

- common container edges and column alignment;
- horizontal overflow and clipped content;
- card media and action-row alignment;
- navigation readability;
- filter height and first-screen density;
- focus visibility and existing interactive behavior;
- absence of new console errors.

## Success Criteria

- Every top-level page visibly follows one shared container and responsive grid.
- Desktop and tablet screens balance information density with breathing room.
- Mobile content follows a clear single-column reading order without overflow.
- Similar cards and panels align consistently across rows.
- The complete existing functional test suite passes without behavior changes.
