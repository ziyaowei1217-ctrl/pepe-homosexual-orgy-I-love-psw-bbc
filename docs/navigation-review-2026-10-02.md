# psw navigation and click review — 2 October 2026

This review responds to problems encountered while using the published fictional
Netlify demonstration. It tests sequences of actual pointer clicks and touch taps,
visible destination content, browser history and dialog focus. Loading each route
directly was insufficient to catch the reused-search and sequential-gallery bugs.

## Confirmed problems and repairs

| Trigger | Observed problem | Repair |
| --- | --- | --- |
| Open Boston from home, then use the shared **转租** navigation | The URL became `/search`, while the input, heading and results still described Boston in Chromium, Firefox and WebKit | Initialize from the destination's server criteria and reconcile committed App Router query changes; preserve native input/history updates and back/forward restoration |
| Browse a map on a phone, select a marker/cluster, then open its preview | The view switch covered the preview; a short landscape viewport also put markers and controls behind navigation | Fit the canvas to the visible toolbar and phone navigation, keep the existing view/filter controls in one row on short screens, separate preview/cluster panels from the view switch and give map buttons at least 44px targets |
| Open a gallery photo, use the keyboard, close it, then click **查看全部图片** | The focused photo tile painted above the gallery CTA and received its click | Keep the gallery CTA above focused photo tiles without removing their focus indicator |
| Tap a date opener in Safari after a gallery interaction, then close the date dialog | Focus returned to the previous photo rather than the tapped date opener | Explicitly focus each date opener before opening the existing dialog |

A follow-up geometry check reproduced a hidden cluster close button and first row
in a 1440×500 desktop window. The compact toolbar/cluster arrangement now also
applies to short desktop windows, with this sixth profile included in the release
click gate. Map attribution remains visible above interactive panels, and short
preview/zoom targets no longer overlap at their edges.

Narrowing a desktop viewport also now replaces the hidden split view with the
visible list view without clearing the user's criteria. This uses the same
existing views and controls; no new marketplace functionality is added.

## Systematic scope

An independent source inventory covered 114 controls in 13 marketplace components:
46 links, 58 buttons, three forms, two anchors, three selects, one textarea and one
summary. Native submit buttons and intentionally disabled controls were inspected
as such, rather than treated as missing handlers.

The fresh baseline client audit recorded 188 asserted scenarios across Chromium
and Firefox desktop and WebKit phones at 320px and 390px. Of these, 173 passed and
15 reproduced the four problem groups above. Separate map-frame probes covered
568×320 landscape and 768×600 tablet layouts. Saved workflows passed 44/44 baseline
checks and filters passed 32/32. Another independent operations audit tested shared
navigation, demo-only destinations, pagination, detail transitions and history;
it separately reproduced the stale Boston criteria.

The combined local production candidate passed 52 navigation and 32 filter checks.
The final map candidate passed 70/70 checks in seven profiles, including rotation,
preview-center navigation and history; gallery/date/roommate checks passed 28/28.
Raw-coordinate taps independently confirmed cluster selection does not scroll the
page. Chromium native touch drags reached the last cluster row on 320px and 568px
screens; WebKit's narrow touch-capable desktop context separately verified native
wheel scrolling and last-row taps. This does not certify physical iOS finger input.

Regression tests cover destination initialization, query reset, dates/budget/
amenities/view restoration, phone normalization, typing with spaces, viewport
resize cleanup and both date-dialog focus openers. The production-browser click
runner exercises visible state and actual control hits across six profiles,
including phone landscape. It uses ephemeral browser state and fictional data.
The final local production build passed 123/123 click groups across all six
profiles, with active map tile delivery verified. Separate visual/geometry checks
confirmed visible map credits and separated preview/zoom targets. The runner’s
owned-server startup and cleanup also passed on the preceding five-profile build.

Release checks also retain the existing API, database, media, realtime, container
and cross-platform validation.

Original failed captures and corrected harness runs are retained in the delivery
evidence. A test-selector mistake or an interrupted local server run is recorded
separately from an application failure. Local candidate checks do not substitute
for checking the exact Netlify preview and published deployment.

## Preservation and release acceptance

The navigation changes preserve existing URL destinations, filter/date criteria,
listing/application transitions, Saved data formats and demo-only explanations.
Independent source review found no changes to auth/session helpers, API handlers,
middleware/CSP, provider transports or dependencies. Map listeners and observers
are cleaned up on unmount. Informational map labels do not intercept pointer taps.

Release acceptance requires the normal production checks, the explicit demo build
and click checks, a fresh independent review of the exact Netlify preview, all five
GitHub jobs passing on its source revision, and a repeat of critical clicks and
security boundaries on the stable URL after publishing that exact deploy. Source,
run and deployment identities are recorded in the handoff outside the repository.

The public demonstration remains fictional and read-only. Account, application,
messaging, uploads and payments still lead to their explanatory demo boundary;
they are not real connected services. Those full-marketplace delivery gates are
separate from this demonstration review.
