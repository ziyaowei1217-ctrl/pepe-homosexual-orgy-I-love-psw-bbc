# psw visual calibration and fresh security/bug review — October 2, 2026

## Scope and independence

Baseline: `3beb232f9a6fc755a35ed09ea39d49acc76dff90`. This pass reviewed actual
source and the published read-only Netlify demonstration again. Separate reviewers
examined application trust boundaries, browser journeys and hosting behavior without
using earlier pass results as assurance. The hosting reviewer separately reviewed the
new backend repair. The exact final commit, CI run and reviewed deployment are recorded
in the release handoff, outside this historical source report.

## Findings and repairs

### P1 / High — owner edits could erase a moderator's roommate archive (repaired)

`api/src/marketplace/marketplace.service.ts:109` now checks the already-locked public
projection's `archivedAt` before an owner PATCH writes any matching facts. Previously,
archiving through the admin endpoint left matching facts active; an ordinary owner
intro edit projected them again, clearing the archive and republishing the card. This
was independently reproduced against the real service and through a regression HTTP
journey. Six new service cases failed on the baseline before the guard was added.

Owner self-hide and matched states now use a non-active status and an empty archive
marker. Discovery and new matching actions still exclude both states. Only an admin
restore can clear a moderator archive. This preserves owner self-hide/restore while
preventing harmless edits and explicit activation from reversing moderation. Tests
include active/hidden/matched archived projections, owner self-hide/restore, explicit
moderator restoration, foreign and historical IDs, and both PostgreSQL race orderings.

Legacy owner-hidden rows also used the archive marker, so they cannot safely be
distinguished from moderation archives. They fail closed until an administrator
reviews and restores them; do not bulk-clear markers. See `docs/roommate-matching-admin.md`.
This backend flaw was not reachable through the demo, which refuses account operations
and upstream transport, but the maintained backend source needed the repair.

### P1 — excluded static prefixes could bypass demo routing after decoding (repaired; hosted acceptance required)

The final hosted review retained actual account-page HTML and its account Flight tree
from raw `/_next/static/%2e%2e/%2e%2e/account` requests, including an uppercase encoding.
Those responses lacked CSP and nonces. An encoded icon-prefix health request also reached
the normalized health handler. This proved that a matcher exclusion based on the raw
static prefix could be followed by provider route normalization to a protected page.
Publication was held when this was established. No real user data or provider action
was demonstrated, but the demo isolation and document-security boundary was bypassed.

`middleware.ts:58` selects every request, and `lib/website-static-path.ts:8`
validates canonical paths before static or public-page eligibility. Only validated canonical inert asset
paths skip document nonce processing; write denials happen before that static fast path.
Regression tests must cover encoded/double-encoded/traversal-looking exclusions, protected
routes and API methods alongside genuine CSS/JS/image assets. Final raw-path hosted
acceptance is required because unit requests cannot certify provider normalization.

### P2 — phone Back navigation could select a hidden view (repaired)

`components/marketplace/search-experience.tsx:41` applies the small-screen split-to-list
normalization when restoring history. Previously, returning from Map to an older URL
without a view selected hidden Split, leaving both visible controls unselected.
The new regression failed before the fix and passed afterward; it also covers desktop
Split and explicit List/Map URLs. Query criteria continue to restore normally.

### P2 — WebKit keyboard focus could leave the image dialog (repaired)

`components/marketplace/use-modal-focus.ts:36` steps plain Tab/Shift+Tab explicitly
through visible enabled dialog controls rather than depending on Safari's button-tab
preference. It preserves Escape, focus restoration, body locking, editing keys and
browser shortcuts. Hidden, disabled and inert controls are excluded; positive tab
order is retained. New regressions failed before the fix. Gallery openers also explicitly focus their
clicked button before opening, so Safari pointer activation restores the trigger on
Escape instead of the prior body; two pointer regressions failed before that repair.
Browser acceptance must
include WebKit at small phone widths as well as Chromium and Firefox.

### P2 / usability — cramped controls and inconsistent hierarchy (repaired)

Existing search, favorites, map, pagination, gallery and dialog controls gain 44 px
minimum targets. Narrow-phone view labels and detail controls no longer stack their
Chinese characters vertically. Search/date and note/name inputs use 16 px phone text.
The location popup has more readable width within the small viewport. These changes
preserve handlers, routes, query names and persistent keys.

The home headline and photo are smaller; monthly rent and dates have clearer spacing.
Saved, detail and roommate views share semibold forest headings, soft green selection
surfaces and restrained corners/shadows. No new marketplace feature, external font,
image provider, runtime library or identity asset is introduced. Sticky header offsets,
reduced motion, safe areas, demo disclosure and error/warning colors are retained.

### P3 / defense in depth — static artwork MIME protection (added)

`netlify.toml:21` adds `X-Content-Type-Options: nosniff` to the static response rules.
The four trusted artwork exports were already inert and correctly typed; this closes
an observed header gap without broadening the demo's exact-path allowlist. Provider
image-CDN errors may have separate headers, so claims about every response are avoided.

## Further observations and limits

- The initial encoded-path probe did not retain its two surprising 200 response bodies,
  and 14 exact raw-path repetitions returned empty 404s. It was initially unconfirmed.
  The later immutable-preview check captured complete account responses and established
  the defect above. Both observations remain preserved; repeat 404s did not invalidate
  the later confirmed exposure, and the release was held for repair.
- Full RSC and prefetch skeletons have different protocol payloads. A classifier that
  expected full demo copy in a skeleton was corrected, with original evidence retained.
  Cancelled speculative RSC requests during navigation are recorded separately from
  settled visible-journey failures.
- The fresh production dependency audit reported zero high/critical advisories and
  one moderate Nest SSE advisory. The [maintainer advisory](https://github.com/nestjs/nest/security/advisories/GHSA-36xv-jgw5-4q75)
  requires user-influenced SSE event type/ID fields. Source search found no SSE endpoint
  or EventSource bridge. This is an exposure assessment, not a clean audit; a future
  Nest major upgrade needs its own compatibility review before SSE is introduced.
- Real payments, provider credentials, production restore exercises and physical
  iOS/Android devices are outside this fictional, read-only demonstration. Full backend
  production readiness remains subject to the documented deployment requirements.

## Validation record

The final web check uses the normal product profile; the read-only demo is then built
separately. An initial new-test type-option error was corrected. A test run with the
demo flag mistakenly enabled exercised normal authenticated tests under intentional
read-only denials; it is retained as a harness/profile error, not counted as acceptance.
The corrected normal-profile suite, separate demo build, full API checks, independent
browser/hosting acceptance and exact-head CI results are recorded in the release handoff.
Original failed and diagnostic outputs are retained; no result is silently rewritten
as passing. Required PostgreSQL race tests execute in disposable CI services because
the local host has no Docker/PostgreSQL runtime.

Local corrected checks: 804 web tests in 116 files plus lint, types and optimized
normal build; 807 API tests passed with 138 explicit opt-in service cases skipped,
plus API types, build and Prisma validation. The independent archive repair review
passed nine additional adversarial cases. The initial eight-component presentation comparison verified navigation, form/query
values and persistent keys. The final gallery opener intentionally adds focus before
opening; six component programs remain unchanged apart from classes, while gallery
opener focus and search history normalization are documented behavior repairs.

After the final routing and pointer repairs, the full local normal-profile web check
passed 914 tests in 117 files, lint, types and the optimized build. The independent
route repair review passed 169 focused tests and 120 additional raw-path/header/write
probes. Compiled shared first-load JavaScript remains 102 kB; middleware grows from
34.6 to 35.1 kB for the canonical-path guard. These are build sizes, not physical-device
performance certification. Final hosted raw-path checks and exact-head CI remain
required; earlier passing CI on 885cc223 did not certify the provider path boundary.
