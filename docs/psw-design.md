# psw — people spaces wellbeing

The product focuses on subleasing for international students: matching a place and its
available dates to school, a trip home, an internship, or a move after graduation.
The identity uses a lowercase wordmark and three connected, doorway-like
figures: people, spaces, and wellbeing have equal weight. It must stay legible at small
sizes, in a single color, and without scripts, external fonts, or a graphics library.

## Visual system

| Token | Color | Purpose |
| --- | --- | --- |
| Forest | `#234B3B` | Brand, primary actions, navigation selection |
| Moss | `#416F5A` | Hover state, supporting brand text |
| Mist | `#F5F8F5` | Page surface |
| White | `#FFFFFF` | Inputs, content surfaces |
| Citrus | `#E9F2A9` | Quiet accent behind dark text |
| Ink | `#203C30` | Identity and home headings |

The existing system sans-serif stack gains Avenir Next where installed; platform and CJK
fallbacks stay local. Body text is readable, titles have a clear scale, and the vector
wordmark uses its own drawn letterforms rather than a font download.

The home page pairs a literal international-student sublease headline and left-aligned
search with a compact photograph of an existing listing. Monthly rent and available dates
lead the listing cards; school commuting and lease-condition confirmation shape the copy.
The search remains the main action; listing data, navigation destinations, and query
behavior remain unchanged. The search and lease information lead the page; the photo
supports them. The layout collapses to a single column on small screens.

## October 2 visual calibration plan

Keep the forest, moss, mist and citrus tokens and the local font stack. Reduce the
home headline to 38/50/64 px and the featured image to 280/300 px. Use 20 px content
corners and restrained borders instead of the large asymmetric hero curve and heavy
shadows. Saved, listing detail and roommate headings use the same semibold hierarchy.
Selection and recommendation surfaces use brand-soft; red errors and amber warnings
keep their meaning. Increase existing search, save, map and date controls to at least
44 px without changing their actions. Keep the 72 px sticky-header offsets, navigation,
query names, local storage, validation and demonstration isolation.

Critique: the previous scale made the photograph dominate a practical student-sublease
task. This pass should make search easier to reach and lease information easier to scan,
while retaining the existing imagery and student-oriented copy. Review actual phone and
desktop rendering, keyboard paths, overflow, dialog focus and reduced motion before release.

```text
Desktop: [psw / navigation / account]
         [intro + existing search] [featured home]
         [popular cities]
         [amenities] [listings] [existing next steps]
Phone:   [psw / account]
         [intro + search]
         [cities / amenities / listings / next steps]
         [existing bottom navigation]
```

This plan deliberately avoids a generic cream/serif/terracotta treatment, decorative
gradient washes, fake success metrics, and extra sections. The spatial photograph and
connected-doorway logo are specific to this housing and roommate product. Green does not
replace red error or amber warning semantics. Existing focus, touch targets, reduced
motion, safe-area handling, demo disclosure, CSP, and privacy protections remain required.

## Maintain and export

`components/brand/psw-logo.tsx` supplies the shared inline logo. `public/brand/` contains
standalone SVG exports; `app/icon.svg` supplies the browser icon. Assets use only local
geometric paths. Product-facing names change; package names, API routes, persistent
storage keys, and historical review evidence retain their established identifiers.

## Review of the October 2 refresh

The security reviewer compared the complete presentation diff with baseline `f1e7dd6`,
including behavior-bearing JSX attributes. API, shared logic, session keys, middleware,
Next configuration, dependency manifests, lockfile, and deployment configuration remained
unchanged in the presentation pass. The independent focused review passed 140 existing tests across 13 files.
The full web suite passed 787 existing tests in 116 files; lint, types, and an optimized
demonstration build passed. The browser smoke gate passed 63 route checks and six private
API-image optimizer denials across Chromium, Firefox, and WebKit.

An independent visual check found the location-suggestion popup extending beyond a
320 px WebKit viewport. Its CSS now clamps the existing popup to its input container.
The follow-up review verified click selection, ArrowDown/Enter without premature form
submission, Escape, and the detail-page header. The final popup also fitted correctly in
Chromium and Firefox at 320 px. Existing touch targets, 16 px phone inputs, safe areas,
reduced motion, focus visibility, and the demo warning remain intact.

Forest/white, forest/citrus, moss/white, and moss/mist text combinations have calculated
contrast ratios of 9.81, 8.28, 5.76, and 5.38 to one respectively. These values apply to
those color pairs, not a blanket accessibility certification. No external fonts, runtime
dependency, authentication flow, or marketplace capability was added. Hosting acceptance
and exact-commit CI evidence are recorded separately with the deployment handoff.

The independent hosting review subsequently found that the demo path allowlist rewrote
the new logo export requests to its explanation page. The only routing exception added
allows the four exact, trusted SVG/PNG artwork paths above. It does not open the brand
directory, documents, private paths, APIs, or writes. Boundary regressions cover GET/HEAD
artwork access, blocked POST requests, and isolation of sibling/traversal-looking paths.
The independent security review of this exception passed 75 tests in five files and
30 additional middleware probes for other write methods and encoded/malformed paths.
