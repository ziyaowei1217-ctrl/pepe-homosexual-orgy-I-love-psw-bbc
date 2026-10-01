# Independent second review — 2026-10-01

The second review found and repaired thirteen distinct security, availability and usability issues.
It started from `4244856b8ca2093493bad0588bf0e6f5e617a498`. Three fresh reviewers independently
inspected source and formed initial conclusions before reading earlier audit reports, PR descriptions,
old evidence or another reviewer's findings. Findings were compared only after those conclusions were
recorded. Reviewers then implemented assigned fixes; their subsequent repair verification is **not**
the independent third review. This review does not certify a public deployment or production providers.

## Findings and disposition

| ID | Finding | Impact / priority | Repair |
| --- | --- | --- | --- |
| SEC-R2-001 | Hosts could read unsubmitted drafts and withdrawn drafts | Medium privacy issue | Require persisted submission for host inbox/detail access; renter/team draft access retained |
| SEC-R2-002 | Viewing changes bypassed chat quota and returned unbounded history | Medium abuse/availability issue | Exact replay is a no-op; real changes share message limits; bounded responses and participant-authorized history pages |
| SEC-R2-003 / R2-D1 | Authentication Valkey operations could stall indefinitely | Medium availability issue; delivery P1 | One-second total operation deadline, client destruction/replacement, fail-closed errors and recovery probes |
| SEC-R2-004 | Archived roommate preferences remained on a public raw endpoint | Medium privacy issue | Both public surfaces require an active, unarchived owned projection, including historical inconsistencies |
| R2-D2 | Missing roommate lookup repeatedly ranked the whole catalog | Delivery P1 | Rank once; local synthetic 10,000-profile lookup fell from 4,022 ms to 59 ms |
| R2-D3 | Invalid production Valkey URLs selected in-memory auth limits | Delivery P2 | Semantic URL validation and failed construction abort production startup |
| R2-D4 | Required infrastructure failure still returned readiness 200 | Delivery P2 | Production readiness 503 for dependency failure; bounded probes restore readiness without spending message quota |
| UX2-1 | Late account hydration overwrote a successful save | P2 data loss | Replay pending user intentions onto hydrated state; retain notes and collection identity collisions |
| UX2-2 | Older roommate chat history was unreachable | P2 usability | Earlier-history cursor controls for roommate/deal messages, deduplication and retry |
| UX2-3 | Opening/sending in a long chat left current messages outside the viewport | P2 usability | Show the latest exchange/own send; preserve position while reading older messages |
| UX2-4 | Roommate deck stopped after its first batch | P2 usability | Continue eligible batches while retaining filters and excluding acted/duplicate candidates |
| UX2-5 | Recent favorites used catalog order | P2 usability | Persist save sequence and show newest first |
| UX2-6 | Invalid collection creation silently closed the dialog | P2 usability | Retain input/dialog and explain errors; handle Unicode names and distinct slug collisions |

The shared messaging limiter also applies an atomic 100-per-minute actor ceiling across conversation
types alongside the existing 20-per-conversation limit. Rejected conversation writes do not spend actor
capacity. Bounded viewing history retains the most recently updated active request; inbox active-state
selection uses a single parameterized database batch rather than one query per thread.

## Verification and reproducibility

The preserved independent reports include original source locations, preconditions, reproductions,
repair notes and limitations:

- [Security report](reviews/2026-10-01-round2/security.json)
- [Delivery report](reviews/2026-10-01-round2/delivery.json)
- [Usability report](reviews/2026-10-01-round2/usability.json)
- [Corrected browser observations](reviews/2026-10-01-round2/browser-results.json)

The corrected client passed 734 web tests, repository lint, TypeScript route generation/checking and a
production build. Fresh Chromium and WebKit journeys at 1440-pixel desktop and 375-pixel touch/mobile
verified all six client fixes, earlier-history position after refresh, visible own sends, keyboard
filter recovery, actual cursor requests and continuation to the next roommate candidate. Initial
browser checks also covered 320-pixel host forms, date validation, gallery focus, application-step
focus and map overflow/keyboard use. Source-import adversarial probes used synthetic Prisma seams;
the stalled connection probe used the actual Redis client against a local silent TCP server.

Consolidated API results and actual service CI evidence are recorded in the final release review.
Local Docker/Postgres/Valkey are unavailable. New PostgreSQL and Valkey regressions are therefore
gated locally. The release workflow now explicitly runs every database integration suite serially
against disposable PostgreSQL/MinIO and includes the actor-quota suite in its real Valkey gate.
Writing a gated test or configuring CI does not count as a successful execution.

One old cleanup fixture sent 1,000 simultaneous messages from one actor; the full suite correctly
rejected it after the actor ceiling was added. The fixture now uses distinct inactive actors and
verifies reclamation of both conversation and actor state while retaining the active quota.

## Remaining delivery conditions

The outer thread list and roommate catalog remain capacity-sensitive; histories are bounded, but
large-catalog production load and outer pagination require further sizing evidence. Ordinary bearer
sessions remain accessible to same-origin JavaScript, making XSS prevention and third-party script
control essential. One moderate Nest SSE dependency advisory remains; no application SSE use was
found. The archived MinIO community demo service remains restricted to loopback synthetic fixtures;
public hosting needs maintained private storage.

Browser fixtures do not prove real email delivery, object-store uploads, payment-provider consistency,
mobile software-keyboard behavior or native store compliance. CI's API container uses development
configuration with disposable providers and does not certify real production TLS connections.
The [Render deployment guide](render-deployment.md) identifies actual provider, ingress, budget,
backup/restore and public acceptance requirements. The independent third review must inspect the
repaired source and deployment configuration before a final handoff.
