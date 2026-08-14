# Sublet Pipeline

Frontend + backend MVP for a high-trust sublet marketplace and co-living matching product.

## Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- shadcn/ui-style source components
- lucide-react icons
- NestJS API
- Prisma
- PostgreSQL
- Socket.IO
- Valkey (optional, for distributed roommate messaging)

## Run Full Local Stack With Docker

The easiest beginner-friendly path is:

```bash
docker compose up
```

Then open:

- Web app: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Database UI: `http://localhost:8080`

The Compose stack starts PostgreSQL, waits for it to become healthy, prepares Prisma for the API, starts the NestJS backend, and then starts the Next.js frontend.

## Local Product Environment

Install dependencies, start Docker Desktop, then prepare PostgreSQL and seed the product catalog:

```bash
pnpm install
pnpm local:setup
pnpm dev:local
```

Open the web app at `http://localhost:3000`. The API is available at
`http://localhost:4000/api/v1`.

The frontend uses `NEXT_PUBLIC_API_BASE_URL`; by default it points to `http://localhost:4000/api/v1`.
Local email codes are shown in the login panel. For development only, comma-separated administrator
emails may be added to `LOCAL_ADMIN_EMAILS` in `api/.env`. Production startup rejects a non-empty
`LOCAL_ADMIN_EMAILS`; use the audited role commands below instead.

## Secure Invitation and Administrator Operations

Run production invitation and role commands only in the server environment, with `DATABASE_URL`
pointing to the intended production database. Every mutation requires an operator email and a reason,
is recorded in the immutable audit log, and prints masked email addresses in command output. Build the
API before running a production command; the production scripts execute only the compiled JavaScript
artifacts and do not require TypeScript development dependencies.

```bash
pnpm --filter sublet-pipeline-api build
pnpm --silent --filter sublet-pipeline-api beta:invites add --email user@example.com --actor operator@example.com --reason "Founding beta cohort"
pnpm --silent --filter sublet-pipeline-api beta:invites list
pnpm --silent --filter sublet-pipeline-api beta:invites revoke --email user@example.com --actor operator@example.com --reason "Access withdrawn"
pnpm --silent --filter sublet-pipeline-api admin:roles grant --email reviewer@example.com --actor operator@example.com --reason "Primary reviewer"
pnpm --silent --filter sublet-pipeline-api admin:roles revoke --email reviewer@example.com --actor operator@example.com --reason "Rotation complete"
```

Masked output resembles:

```text
{"id":"...","maskedEmail":"u**r@example.com","status":"ACTIVE",...}
{"maskedEmail":"r******r@example.com","role":"ADMIN","outcome":"SUCCESS"}
```

Administrator HTTP writes require a fresh step-up token. Authenticate normally, request a code with
`POST /api/v1/auth/admin-step-up/email-code`, verify it with
`POST /api/v1/auth/admin-step-up/verify`, and use the returned access token for the administrator
write. Ordinary login tokens intentionally do not contain the step-up claim.

## Listing API Migration

The former `/api/v1/housing-listings` API is retired. Collection and item requests return HTTP 410
with `LEGACY_LISTINGS_RETIRED` and point clients to `/api/v1/listings`. The old PostgreSQL table
remains available only as a write-protected archive; new application code must not read from or
write to it.

## Roommate Matching Deck

The roommate discovery flow is intentionally Tinder-like: quick cards, one-tap decisions, match reasons, tradeoffs, icebreakers, and a ranked queue.

Backend endpoint:

```bash
GET /api/v1/roommates/deck?limit=80&cursor=0&budgetMin=1200&budgetMax=1800&schools=UCLA,USC&hobbies=早睡,安静
```

The response includes paginated candidates plus discovery metadata:

- `compatibilityScore`
- `dimensions` (`budget`, `lifestyle`, `school`, `area`, `reliability`, `profile`)
- `matchType` (`top-pick`, `strong-fit`, `explore`, `wildcard`)
- `recommendation` (`action`, `confidence`, `primarySignals`, `watchouts`, `nextQuestions`)
- `ranking` (`finalScore`, `confidenceScore`, `profileQualityScore`, `diversityBoost`, `explorationBoost`, `strategy`)
- `decisionHint`
- `rank`
- `deckBatch`
- `spark`
- `reasons`
- `tradeoffs`
- `icebreaker`
- `badges`
- `pageInfo.nextCursor`
- `discovery.weights`
- `discovery.rankingWeights`

Use empty `school=` / `hobby=` or empty `schools=` / `hobbies=` for broad discovery instead of a narrow filter. The frontend sends both legacy single-value fields and full multi-value fields so older clients remain compatible.

The algorithm is intentionally two-stage:

1. Score roommate compatibility from roommate-relevant variables.
2. Rank the swipe deck with confidence, profile quality, diversity, and exploration so large samples do not collapse into a repetitive list.

Admin/developer management endpoints:

- `GET /api/v1/admin/roommates`
- `POST /api/v1/admin/roommates`
- `PATCH /api/v1/admin/roommates/:id`
- `POST /api/v1/admin/roommates/:id/archive`

See [docs/roommate-matching-admin.md](docs/roommate-matching-admin.md) for the exact payload and the safe way to add or edit deck profiles.
The developer UI is available at `/admin/roommates`.

## Roommate Messaging

The backend wires authenticated direct messages between reciprocal roommate matches, durable message
history in PostgreSQL, unread counts, monotonic read cursors, and realtime message/read events. Unread
state is derived through the HTTP conversation APIs; there is no separate realtime unread event.
The HTTP collection starts at `/api/v1/roommate-conversations`; Socket.IO clients connect to the
`/roommate-messaging` namespace. HTTP history and unread state are authoritative on initial load and
are the recovery path after a reconnect or any offline period; realtime events accelerate the online
experience but do not replace an HTTP refresh.

The web app integrates these server conversations into the unified Messages inbox alongside host
conversations. It supports durable history and pagination, server-backed unread/read state,
optimistic text sends with idempotent retry, validated realtime updates, conversation deep links,
and bounded HTTP recovery after reconnect, browser focus, or reload. Roommate message content is not
stored in browser storage.

This messaging scope intentionally does not include email or Web Push offline notifications,
attachments, group chat, typing indicators, message editing, message recall, or presence claims.

## Verify

```bash
pnpm typecheck
pnpm build
pnpm -C api test
pnpm -C api typecheck
pnpm -C api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api prisma validate
```

## Launch Readiness

`GET /api/v1/health` is a process-liveness check and does not query PostgreSQL. `GET /api/v1/ready`
queries PostgreSQL and reports the sanitized roommate-messaging infrastructure state. A database
failure makes readiness fail; messaging fallback leaves the database-backed API available with
`status: "degraded"`. Health responses and operational logs must never contain credentials, raw
configuration values, message bodies, or caught-error text.

The `realtime` and `messageRateLimit` readiness components each report one of these modes:

- `single-instance`: `VALKEY_URL` is empty; Socket.IO fan-out and message rate limiting are local to
  one API process. This is a supported local and single-instance deployment mode.
- `distributed`: `VALKEY_URL` is configured and that component is using Valkey successfully.
- `local-fallback`: Valkey was configured but a connection, timeout, protocol, or runtime failure
  caused a component to fall back to local behavior. The API remains usable, but cross-instance
  realtime delivery or globally shared rate-limit accounting is degraded until recovery.

Run the always-on release checks and real PostgreSQL 16 smoke tests from the repository root:

```bash
pnpm -C api launch:check
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api launch:smoke
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api launch:smoke:roommate
```

`launch:check` runs the non-database pre-release checks. `launch:smoke` requires a migrated PostgreSQL
database and exercises the core HTTP flow against real Prisma. `launch:smoke:roommate` uses a
disposable PostgreSQL database to prove the roommate migrations and durable HTTP/realtime journey.

Valkey is optional. To start only the Compose service used by the distributed smoke gate, then run
the combined Lua limiter and two-instance Socket.IO test:

```bash
docker compose --profile realtime up -d valkey
RUN_DB_SMOKE=1 RUN_VALKEY_SMOKE=1 \
  DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' \
  VALKEY_URL='redis://127.0.0.1:6379' \
  pnpm -C api launch:smoke:valkey
```

Ordinary test runs skip database- and Valkey-gated integration suites when their opt-in flags are
absent and do not connect to those services. Keep `VALKEY_URL` empty when distributed fan-out and
rate limiting are not needed.

## Current Scope

The local product supports email-code login, persisted profiles, date-bounded host listing submission,
administrator review, approved public listings, full-coverage stay-date filtering, two-sided host/renter messages, viewing requests
and host decisions, ranked roommate discovery, administrator-managed roommate profiles, reciprocal
matches, backend roommate direct messages with durable history/unread/read state and realtime events,
roommate messaging in the unified web inbox with optimistic send/retry and reconnect recovery,
active deal rooms, and idempotent group-tour requests. Empty database tables produce intentional
empty states.

Reciprocal roommate matches can use the durable direct-message experience described above. Online
applications, payments, demo held funds, two-person team confirmation, MinIO-backed host uploads,
production hosting, and the messaging non-goals listed above are not wired yet. Stripe, Mapbox, real
email delivery, Redis queues, and production moderation providers are also not connected.
