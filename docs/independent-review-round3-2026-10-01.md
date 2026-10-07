# Independent third release review — 2026-10-01

The three original reviewers independently examined baseline commit
`6e79733dbad38adb6800e462b62e18f3e6da7704`, recorded their conclusions, and only then coordinated
repairs. They did not read earlier audit reports, prior review evidence, or prior PR descriptions
before recording those conclusions. Current source, operational documentation, and newly written
adversarial harnesses and browser journeys were permitted. The later PostgreSQL driver verifier
reviewed the proposed repair independently; that focused verification is separate from the three
original reviews.

The review recorded **eleven findings**: three security/integrity/capacity findings, five frontend
findings, and three operational findings. Assigned source fixes are complete and focused local
regressions pass. A later Low production-ownerless visibility finding extends `R3-SEC-001`; it is
also repaired and is not counted as a twelfth original finding. Final local web/API gates pass; service-backed CI must execute on the committed source before
handoff. The recorded local results and source hashes are preserved separately; final CI status
can be verified through the [release pull request checks](https://github.com/ziyaowei1217-ctrl/pepe-homosexual-orgy-I-love-psw-bbc/pull/5/checks). This report does not certify a
public deployment or provider integration.

The preserved records and browser evidence belong in
[`docs/reviews/2026-10-01-round3`](reviews/2026-10-01-round3/README.md). Initial observations,
including probes that deliberately assert the vulnerable baseline behavior, are retained alongside
repair checks. A failed native Prisma cancellation experiment and a failed terminal-shutdown
reuse stress test are retained as limitations, not converted into passing evidence.

## Findings and disposition

Priorities below retain the original reviewers' severity labels. References describe the repaired
source; the raw records retain the baseline locations, preconditions, and reproductions.

| ID | Priority | Confirmed behavior | Repair and verification |
| --- | --- | --- | --- |
| R3-SEC-001 | Medium | A saved target ID could accept new actions after hiding/archive and create a new match/conversation; an unavailable actor could publish a new inbound action. | Stable-order row locks and visibility rechecks occur inside the serializable matching transaction before writes. Historical authorized conversations remain readable. Focused action/privacy tests pass; actual PostgreSQL race cases await CI. |
| R3-OBS-001 | Low | Reusing a message command ID with different text returned the original message as success. | Different canonical bodies now return 409, including unique-race recovery; identical replay performs no extra write, quota consumption, or event. Client retry IDs survive only unchanged conversation/text. UUID-case normalization remains deliberately deferred. |
| R3-OBS-002 | Medium | One account could create unbounded active raw matching rows; the anonymous raw profile query returned the whole collection. | Owner/profile locks serialize canonical publication; repeated creates reuse the newest row, historical update IDs conflict, older active rows retire, and a bounded canonical public query returns explicit capacity 503. Local tests pass; real database locking/capacity cases await CI. |
| UX3-1 | P2 | Saved homes at the same approximate map coordinates overlapped, hiding usable touch targets. | Existing collision groups open a modal choice with each title/price, 44px targets, keyboard containment, Escape, and trigger focus return. Verified in Chromium, Firefox, and WebKit fixtures. |
| UX3-2 | P2 | Likes/matches read showed no loading state and provided no in-page recovery after failure. | Loading status, a real retry action, preserved tab, and stale-session response exclusion. Slow/failing/late-response browser fixtures pass. |
| UX3-3 | P1 | Mobile inbox back-to-list reopened the first conversation, preventing a stable list and other conversation choices. | Base mobile route keeps selection empty; explicit routes and desktop defaults remain. Final multi-engine back/forward/list/selection journeys pass, including cached navigation. |
| UX3-4 | P2 | Firefox profile layout expanded to 350px at a 320px viewport. | Explicit shrinkable grid tracks and constrained textarea sizing. Final 320px browser layout checks pass. |
| UX3-5 | P2 | WebKit Escape returned focus to a previous element instead of a mouse-clicked dialog opener. | Dialog triggers focus themselves before opening. Search, collection, and saved-map focus-return checks pass. |
| OPS3-1 | P2 | Connected Pub/Sub clients could blackhole publication/delivery while readiness stayed healthy. | Active bounded publisher-to-subscriber nonce probe, bounded publications, stale-client destruction, and production 503. Actual installed Redis TCP fixtures prove both failure paths and healthy fresh-adapter recovery. |
| OPS3-2 | P2 | Accepted database queries could hang readiness and pin payment recovery indefinitely. | Official Prisma PostgreSQL adapter with actual socket-close query deadlines, bounded pool acquisition, shared readiness work, and verified later recovery. Installed driver/wire/TLS tests pass; PostgreSQL-backed regressions await CI. |
| OPS3-3 | P2 | Anonymous small/empty pages and missing candidate details still loaded and scored the entire catalog. | Supported capacity 5,000, DB `take=5,001`, explicit overflow 503, early ineligible-detail rejection, bounded action lookup, and reused ranking preference. Complete below-cap paging and no-scoring overflow tests pass. |

The production-ownerless extension to `R3-SEC-001` used three fresh LIKE/PASS/LATER probes to show
that an active ownerless target, excluded from production discovery/detail, still persisted an
action and exposed its name in feedback. The authoritative transaction now rejects that target
with an opaque 404 before any action or feedback. Eligible owned production behavior and ownerless
development seed behavior remain covered. This extension was recorded before its repair.

## Security and publication consistency

[`roommate-match.service.ts`](../api/src/roommates/roommate-match.service.ts) locks the actor and
target owned profiles in stable ID order, then checks the current target and existing actor
visibility before persisting an action or opening contact. Serialization retries are bounded;
recognized model serialization errors and raw PostgreSQL serialization/deadlock errors have
explicit handling. Actual archive-versus-action row-lock races are authored as database-gated
regressions. Local mocks cannot prove native locking or rollback.

[`marketplace.service.ts`](../api/src/marketplace/marketplace.service.ts) reuses one canonical raw
publication for an owner, validates merged facts, rejects stale historical update IDs, and retires
older active publications atomically with the public projection. Repeat POST cannot silently
re-enable a hidden, matched, or archived profile; the existing explicit owner opt-in update remains.
The public query chooses the current canonical row before applying visibility and user filters.
A non-destructive lookup index supports this query; historical records are suppressed immediately
and retired on the next write, rather than deleted. The cap bounds returned rows/JSON and discovery
ranking input; it does not claim that every database scan or anonymous request-rate path is bounded.

Message replay checks remain behind membership authorization. Matching conversation and trimmed
body returns the durable original; changed text conflicts, and the frontend generates a fresh
command ID for that changed command. Existing authorized action and conversation history is
retained. The privacy fixes prevent new publication/contact after withdrawal; they do not erase
historical relationships.

Fresh security checks also covered JWT algorithm/freshness/current role, OTP purpose/consumption,
production quota failure, admin step-up, input-field forgery, outsider messaging, unpublished media
and conditional-cache reads, streamed upload bounds, actual image re-encoding/metadata removal,
SQL-bound hostile search input, provider URL/redirect boundaries, refund recovery keys, and socket
expiry. No additional directly exploitable authorization, SQL, input, or provider-boundary issue
was demonstrated within this source and synthetic evidence. Browser bearer storage, local-only
logout, and sessions valid for up to seven days remain the documented session boundary; no DOM XSS
was demonstrated, and immediate token revocation was not added.

## Actual transport deadlines and recovery

The first attempted database repair added `socket_timeout=3` to the installed native Prisma
configuration. A fresh fixture completed startup/prepare/bind and accepted `SELECT 1`, then
withheld completion. The actual native query remained pending after 13 seconds. Native
`$disconnect()` likewise remained pending after 5.1 seconds; destroying the fixture socket settled
both. A server statement timeout or a caller-only `Promise.race` would not establish recovery from
this accepted network blackhole, so that attempted repair was rejected.

[`bounded-postgres.ts`](../api/src/prisma/bounded-postgres.ts) now contains the maintained official
`@prisma/adapter-pg` path. Prisma client, CLI, and adapter are pinned to **6.19.3**; `pg` is pinned to
**8.20.0**. Model/service contracts and the generated client are preserved. The driver bounds
connection/pool acquisition to two seconds and each actual query to three seconds. Its deadline
calls the public `pg` client `end()`, which destroys an active socket and settles driver work;
ended clients retire from the pool. Promise, callback, and Query-emitter completion clear their
timers. The configured client class survives adapter-created pool recreation after ordinary
disposal/reconnect. Pool size is explicit and restricted to 1–10 connections.

Installed-driver evidence proves accepted query settlement, one underlying query for twelve
concurrent readiness callers, subsequent healthy readiness, and later payment recovery scans.
A stalled interactive transaction rejects and a fresh transaction commits on a new connection.
Same-client queued queries do not reach the blackholed socket; acquisition expires, and actual
sockets, pool clients, and waiting work drain. Ordinary raw-query disconnect/reconnect retains the
transport deadline. The focused verifier independently repeated these checks against the frozen
helper and compared native/adapter serialization error mapping.

[`HealthService`](../api/src/health/health.service.ts) shares one in-flight dependency check and
runs distributed infrastructure checks alongside the database query. Its separate 3.5-second
response deadline is below Render's five-second health-check budget. A caller timeout retains the
single underlying check until actual driver work settles; repeated callers cannot accumulate new
accepted readiness queries. Production returns 503 unless all required dependencies are healthy
and distributed.

TLS verification is explicit. The runtime reconstructs a query-free driver URL, rejects unknown
or ambiguous parameters, enables CA-chain verification, and checks the exact URL hostname,
including normalized IPv6 brackets. Fresh local trusted-certificate transport tests accept the
correct DNS hostname and preserve DNS SNI; the same trusted certificate for an IP host fails
`ERR_TLS_CERT_ALTNAME_INVALID`. Without the test CA, chain validation rejects the certificate.
Test-only certificates/keys are not provider credentials. The same quoted literal schema is passed
to the adapter and PostgreSQL startup `search_path`; whitespace/backslashes are escaped, ambiguous
`$user`/`pg_temp` aliases rejected, and nonempty/NUL-free 63-byte names enforced. A real PostgreSQL
custom-schema execution regression awaits CI. The plaintext development Compose connection is
explicitly limited to its non-production `db` hostname with `sslmode=disable`, alongside loopback
local development/test. Production and other remote connections retain verified TLS.

The focused verifier's original frozen-helper SHA
`c4f1763413f905a32f3eeb1846c42cda3446a113322465f6513c671ce533e00a` and its recorded outcomes are
preserved. A subsequent narrow compatibility change added the explicit development Compose
plaintext opt-in and rejects non-Compose remote plaintext. The current helper SHA is
`ad632c16c3e7c308738ed0cd295f9345e2758b955ec65e739ef4ef00dd1de446`.
The actual query-close/queue/reconnect logic is unchanged. Post-change configuration/TLS tests
passed, including production Compose-host plaintext rejection, other remote plaintext rejection,
verified default `db` behavior, and the explicit non-production exception. Root's final
configuration/TLS/release checks supersede this delta for final source acceptance.

Two limits remain explicit. Closing a write/COMMIT socket does not establish whether the server
committed; durable idempotency, fencing, and reconciliation must determine the outcome. Also,
`$disconnect()` overlapping an active interactive transaction drains actual transport/pool work
but can settle at approximately **five seconds**, and reuse of that same Prisma instance after
terminal shutdown failed in the retained stress harness. Process shutdown is terminal; the
30-second Render grace covers that observed path. Ordinary failed-operation recovery is separately
proven. The native migration/schema-engine CLI does not use the application driver; finite
reviewed server/process operational deadlines and explicit migration success remain required.
See the [Render runbook](render-deployment.md) and primary
[Prisma 6 driver](https://www.prisma.io/docs/orm/v6/overview/databases/database-drivers) and
[pg client](https://node-postgres.com/apis/client) documentation.

Realtime readiness now requires a unique nonce published through the actual publisher and
received on the actual subscribed connection. `PING` or `isReady` alone is insufficient. Lost
delivery or a stalled operational PUBLISH destroys stale clients, fails production readiness,
and stops new publications on those clients. The process does not replace the active Socket.IO
adapter and discard room memberships. After restoring Key Value, a fresh process/adapter must
pass its actual round trip; browser reconnect uses durable history. Local Redis protocol fixtures
prove this behavior, but do not certify real Render fan-out, persistence, or polling affinity.

## Capacity and frontend evidence

Discovery queries take at most 5,001 active/unarchived profiles, require ownership in production,
and establish a deterministic ID tie order. Above the supported 5,000 catalog capacity, both
public profile paths return `503 DISCOVERY_CAPACITY_EXCEEDED` before scoring; they do not publish
partial results. Missing, hidden, archived, self, and previously acted candidate details return
before scanning the catalog. Below the limit, complete ranking/paging is preserved, including a
241-profile full traversal and the final 40 profiles at exactly 5,000. Existing diversity/ranking
strategy is retained; duplicate preference work is removed.

A fresh macOS arm64/Node 25.8 diagnostic harness measured 5,000 profiles at roughly 28ms event-loop
lag and 14MB heap growth. Catalogs of 5,001 and 50,000 rejected before reading any scoring budget
field, using `take=5,001`. This is not a Render capacity guarantee: database, network, serialization,
and sustained traffic differ. A verified anonymous ingress rate/concurrency limit and latency/CPU/
event-loop measurement on the selected instance remain required before opening public traffic.

Frontend review used new Chromium, Firefox, and WebKit journeys with actual 320/375/768/1440
viewports and root-provided synthetic API data. Final production-server fixtures prove the stable
mobile inbox list through route links and browser back/forward; map selection, loading/retry,
profile bounds, focus return, offline-draft retention, and stale-session exclusion also pass.
The guest application handoff retained entered facts and reached a single create/submit; message
retry retained the command ID only for unchanged text. No new feature or visual redesign was added.

These are synthetic browser proofs. CSS 200% zoom is not native browser zoom. Synthetic touch,
mouse, keyboard, and default zero-inset emulation do not prove physical touchscreen, soft keyboard,
screen reader, native safe-area, Safari keyboard settings, background recovery, or provider behavior.
Flat synthetic images limit conclusions about final media quality. The later final inbox history
record supersedes the preserved first-build cached-selection failure; neither record is discarded.

## Verification ledger

This ledger records local gates completed before the final service-backed CI run. The delivery
validation manifest records that subsequent run, exact commit, and all job results; use the
[release checks](https://github.com/ziyaowei1217-ctrl/pepe-homosexual-orgy-I-love-psw-bbc/pull/5/checks)
to verify the committed source. Workflow configuration alone is not passing evidence.
Counts are separate executions and must not be summed into a coverage total.

| Evidence | Recorded result | Meaning and limit |
| --- | --- | --- |
| Security focused source regressions | 52 passed; 10 real database cases skipped locally | Canonical/publication/action/message branches pass; actual PostgreSQL locking/capacity remains CI work. |
| Security independent adversarial recheck | 44 passed | Fresh boundary probes on current source; not live infrastructure certification. |
| Production-ownerless extension regressions | 38 affected tests passed, including four added cases | Production opaque 404/no writes; eligible production and development compatibility retained. |
| Operations focused suite at freeze | 98 passed; 5 real PostgreSQL cases skipped locally | Installed transport, health, socket, config, discovery regressions pass. |
| Operations final narrow checks | 36 capacity/emitter tests passed; 2 actual Redis protocol tests passed | Later capacity boundary, emitter cleanup, real blackholed PUBLISH, and production 503 checks. |
| Combined production configuration gate tests | 63 passed | Safe syntactic contract; actual provider connectivity remains external acceptance. |
| UX affected suite and scoped lint | Final refinement: 44 tests passed; scoped lint clean | Browser evidence and final production rebuild are recorded separately. |
| Web tests/typecheck/production build | Root reported 753 web tests and successful final web typecheck/build | API gates completed separately after unchanged frontend freeze; production browser journeys use synthetic APIs. |
| Final rebuilt frontend smoke | 63 production browser assertions and6 optimizer denials passed across3 engines | Synthetic API; unchanged frontend source after this run; supplementary private journeys and screenshots preserved. |
| Baseline service/container CI | Root verified success on `6e79733`; included 63 browser assertions and 6 optimizer denials | Baseline success is not evidence for the repaired final source. |
| Final local web/API lint, tests, typechecks, builds | Web753 passed; API799 passed/134 service cases skipped; all type/build/schema gates passed | [Root gate record and source hashes](reviews/2026-10-01-round3/root-local-validation.json); compile-only DI fixture corrected after an initial2-test failure. |
| Compiled CLI and production audit | 2 compiled CLI tests passed; high/critical audit gate passed | Existing moderate Nest exception remains recorded; audit does not cover archived local storage. |
| Final release service-backed/portable CI | Required on this committed source before handoff; results in release checks and final delivery manifest | Four native OS/Node jobs plus actual PostgreSQL/storage/Valkey and hardened container/browser job; require every job to execute and succeed at the exact release SHA. |

The local marketplace smoke command was attempted and failed because Docker/psql services were
unavailable; no local marketplace pass is claimed. CI provides those services.

Local reviewers had no Docker/PostgreSQL/Valkey services available. Fifteen newly authored actual
PostgreSQL cases are gated for service CI: ten security cases and five driver cases. The driver
cases cover accepted `pg_sleep`, subsequent SELECT, shared readiness, transaction write rollback/
recovery, model error mapping, and custom-schema raw SQL. Local wire fixtures exercise installed
clients and actual sockets; they are neither database emulators nor evidence of server-side row
rollback, schema permissions, or cloud recovery.

Fresh local stalled HTTP bodies also verified existing finite provider failure paths: email used
two attempts and failed at about five seconds, payments at eight seconds, and actual S3 SDK reads
at fifteen seconds, with sanitized failures. Fresh CLI and portable-runner probes verified generic
credential-free errors, invalid-input rejection before constructing a database client, and safe
Windows/Linux invocation logic. The latter were simulations, not native OS execution.

The repaired production dependency audit reports zero high/critical advisories and one existing
Moderate `@nestjs/core@10.4.22` advisory,
[GHSA-36xv-jgw5-4q75](https://github.com/nestjs/nest/security/advisories/GHSA-36xv-jgw5-4q75).
The vulnerable Nest SSE path requires user-influenced SSE type/id fields; no `@Sse`, `EventSource`,
`SseStream`, or `text/event-stream` bridge was found in the source. This recorded reachability
exception is bounded to the current JSON/Socket.IO routes; a coordinated Nest major upgrade is
separate work. New driver dependencies introduced no additional audit finding.

## Publication readiness and remaining requirements

The user has authorized public website publication and selected Render. Publication authorization
is present. Missing budget, account billing, provider configuration, and acceptance evidence remain
separate prerequisites; source completion does not authorize unspecified charges or certify those
external services.

Fresh validation against Render's current published JSON Schema passed, and current primary
Blueprint/Docker/health/pre-deploy/WebSocket/provider documentation revealed no concrete Blueprint
contract mismatch. The authenticated dashboard reached **Payment Information Required**; no card
is on file, no monthly spending ceiling has been supplied, and no paid resources or public
deployment have been created. The dated illustrative compute total is **$61/month**: API $25, web
$7, Postgres $19, Key Value $10, and Hobby workspace $0. It excludes storage, bandwidth, builds,
providers, domains, adapter hosting, monitoring, recovery resources, taxes, and workspace upgrades.
See the [dated budget and deployment runbook](render-deployment.md) and
[official pricing](https://render.com/pricing).

Before public publication can be certified, the operator must complete these concrete steps:

1. Supply and approve the spending ceiling and usable Render billing/account setup.
2. Prepare and validate actual private S3-compatible storage, upload CORS/private denial, a verified
   email sender with delivered login, the map provider/origin restrictions/attribution, and all
   genuine scoped configuration values.
3. Supply a reachable hosted sandbox payment adapter. Only its client contract exists today;
   durable idempotency, payable-order uniqueness, lost response, fencing, cancellation, and pending/
   final refund/recovery guarantees must be demonstrated against that adapter.
4. Obtain exact final-commit non-skipped release CI success, run the combined actual production
   configuration gate, validate maintained external Postgres/Key Value TLS and network allowlists,
   migration access/timeouts, quotas/Pub/Sub/persistence, and a restore drill.
5. Verify the actual ingress forwarded-hop chain and spoof rejection, CORS, HTTPS/WSS, anonymous
   rate/concurrency controls, polling-only and WebSocket reconnect across a Render deploy, and a
   full public browser/provider interruption/recovery journey. Actual target devices remain part
   of mobile acceptance.

One API instance is the documented initial deployment. Socket.IO polling still requires affinity
across old/new processes during deploy; one configured instance does not prove uninterrupted
polling through that transition. Real authenticated provider journeys, cloud restore, native mobile
packaging, and final Windows/Linux/container behavior are outside the local synthetic evidence.
The source fixes pass the recorded local gates. Final service-backed CI and external acceptance
are separate: require the exact committed source to pass every CI job, then complete the actual
production/provider checks before opening the public website.
