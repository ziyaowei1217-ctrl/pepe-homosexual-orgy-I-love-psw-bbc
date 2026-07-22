# Editorial Grid Redesign

## Goal

Give the complete renter and host product an unmistakably new visual identity by turning the existing 12/8/4 responsive grid into the primary visual language. The redesign must feel editorial, structured, and modern while preserving every current workflow, route, data source, label, and state transition.

## Approved Direction

The approved direction is an editorial grid rather than a dense administration dashboard or an image-led marketplace. The grid should be visible through alignment, section numbering, typography, tonal surfaces, and consistent column proportions—not through decorative grid lines.

The approved Stay preview establishes the reference treatment:

- a compact horizontal application bar;
- a numbered search workspace;
- a restrained monochrome foundation with blue reserved for active and primary states;
- a 7/5 inventory and map workspace on desktop;
- aligned listing media, information, and actions;
- a single-column reading order on narrow screens.

## Visual System

### Grid and Rhythm

- Desktop at 1280px and above uses 12 columns, 24px gutters, and a maximum 1440px content width.
- Tablet from 768px through 1279px uses 8 columns and 20px gutters.
- Mobile below 768px uses 4 columns and 16px gutters.
- Primary vertical spacing uses 16px, 24px, 32px, and 48px steps.
- All top-level headings, tools, cards, maps, and sidebars align to shared column edges.
- Decorative body grid lines are removed. Alignment should communicate the grid without a literal grid background.

### Color and Surfaces

- The application background becomes a clean, warm neutral rather than blue-tinted graph paper.
- White and near-neutral surfaces carry most content.
- Soft blue tonal sections distinguish search, selected, and trust-related content.
- Bright blue is reserved for primary actions, active navigation, prices, and selected states.
- Standard panels use fine neutral borders, 16–20px radii, and shallow shadows.
- Badges remain compact and status-specific; they do not become decorative pills on every line.

### Typography

- Display headings use larger type, compact line height, and deliberate wrapping.
- Section identifiers use an editorial numbering pattern such as `01 / STAY` and `02 / DISCOVER`.
- Heavy emphasis is limited to page titles, prices, and primary decisions.
- Metadata, descriptions, and status explanations use consistent muted styles.
- English and Chinese product copy remain unchanged; the redesign changes presentation, not wording.

### Navigation and Controls

- The desktop header becomes a clearer horizontal application bar aligned to the shared grid.
- The active section uses a strong filled or blocked state rather than relying on a subtle underline alone.
- Mobile keeps the existing menu behavior and destinations.
- Buttons, inputs, selectors, and focus states use shared control tokens and consistent 12–16px radii.
- Existing accessible labels, disabled states, keyboard focus, and event forwarding remain intact.

## Page Templates

### Stay

- The search workspace spans all columns and combines the page introduction with destination, dates, budget, and the existing controls.
- Match status and quick-filter information form a compact horizontal context strip.
- Desktop map mode uses a 7/5 inventory and map split.
- List mode uses a denser editorial directory without changing filters or selection behavior.
- Listing cards use consistent media ratios, aligned prices, restrained tags, and fixed action-row alignment.

### Listing Detail

- Listing detail uses an 8/4 desktop template.
- The main region contains media, title, price context, facts, rules, and trust evidence.
- The sidebar contains the existing saved, landlord message, tour, application, and roommate actions.
- Tablet and mobile place the action region after the primary content without changing action order.

### Roommates

- Preferences occupy four desktop columns and discovery occupies eight.
- Preference controls become a structured editor rather than a large decorative card.
- Candidate cards emphasize identity, match evidence, and Like/Later/Pass decisions.
- Existing preference ranking, mutual-like logic, group membership, and DM routing remain unchanged.

### Like Queue

- Desktop presents the three existing states as equal editorial workflow columns.
- Tablet uses two columns and mobile uses one.
- Waiting, mutual, and group-ready status remain visually distinct without changing classification rules.

### Messages

- Desktop uses a compact 3/9 mailbox layout.
- Contacts use denser rows with clearer unread, target, and time hierarchy.
- Conversation content becomes a readable timeline with a stable composer and contextual action bar.
- Existing narrow-screen authority is preserved: `/messages` shows contacts, while a targeted message URL shows the conversation and return control.

### Trips

- Trips uses a 4/8 control-console template.
- The left region summarizes trip or application status.
- The right region presents viewing, application, payment, and stay progress using the existing data and actions.

### Publish

- Publish uses an 8/4 editor and review template.
- The main region contains the current publishing steps and form content.
- The sidebar contains preview, listing state, and review information.
- Authentication presentation is restyled but its API and local-demo behavior stay unchanged.

### Trust

- Trust uses an 8/4 information and operations template.
- The main region explains trust mechanisms and roadmap content.
- The sidebar presents the current review queues and moderation actions.

## Component Boundaries

The current application owner remains `components/sublet-app.tsx`; business logic stays where it is. The redesign may introduce small presentation-only components for repeated editorial elements such as section headings, context strips, field shells, and workspace headers.

Shared visual tokens belong in `app/globals.css` and `tailwind.config.ts`. Existing primitives in `components/ui` may be restyled, but their variants, props, ref forwarding, and event behavior must remain compatible.

No dependency is added. No API contract changes.

## Data and Error Behavior

- Existing API reads, writes, and authentication flows remain unchanged.
- Existing local seed and workflow fallbacks remain available when the API is unavailable.
- Empty, loading, error, and disabled states retain their current meaning and actions.
- The redesign must not create new network calls, storage keys, or error-handling branches.

## Responsive Behavior

- At 1440px the editorial hierarchy, sidebars, map, and multi-column workspaces are fully visible.
- At 1024px the 8-column system retains useful two-column layouts where content remains readable.
- At 768px supporting content follows the primary task and complex cards reflow without clipped actions.
- At 390px all pages use a single reading flow, compact navigation, and full-width task controls without horizontal overflow.

## Implementation Sequence

1. Establish global color, typography, surface, control, and editorial-section tokens.
2. Implement the approved Stay reference and listing-card system.
3. Apply the reference language to listing detail and Roommates.
4. Redesign Like Queue and Messages.
5. Redesign Trips, Publish, Trust, and shared authentication presentation.
6. Complete full automated and responsive browser verification.

## Verification

Automated verification must include:

- focused structural tests for the visual tokens and page-template contracts;
- all existing Vitest tests without weakened assertions;
- lint and TypeScript checks;
- a successful Next.js production build.

Browser verification covers Stay, listing detail, Roommates, Like Queue, Messages, Trips, Publish, and Trust at 1440x1000, 1024x900, 768x1000, and 390x844. It must confirm:

- shared container edges and correct grid proportions;
- no horizontal overflow or clipped interactive controls;
- clear hierarchy and aligned card actions;
- unchanged route, favorite, Like/Later, landlord DM, roommate DM, tour, and application behavior;
- unchanged narrow-screen Messages pane behavior;
- no new console errors.

## Success Criteria

- The application is visibly different from the current interface at first glance.
- Every top-level page uses one coherent editorial grid language.
- Blue is purposeful rather than ubiquitous, and neutral content has a clearer hierarchy.
- Similar content and actions align consistently across pages.
- Desktop feels spacious and structured, tablet remains productive, and mobile remains direct and unclipped.
- All existing product behavior and automated checks remain intact.
