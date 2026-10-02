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
order is retained. New regressions failed before the fix. Browser acceptance must
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

- Two initial encoded-dot-segment probes recorded HTML 200 responses without a demo
  marker, but that probe did not retain the bodies. Follow-up raw-path requests with
  preserved bodies, including curl without normalization and concurrent Python probes
  on both the stable and immutable baseline, returned empty 404s. Canonical account and
  full RSC responses contained the demo explanation only. No protected body or router
  exposure was established. The original observation and its missing-body limitation
  remain in the hosting evidence; this is not claimed as a confirmed or repaired flaw.
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
passed nine additional adversarial cases. JSX behavior attributes are unchanged in
eight presentation components; full programs are unchanged apart from classes in
seven, with only the documented history repair changing search logic.
