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

## Verify

```bash
pnpm typecheck
pnpm build
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

## Launch Readiness

From `api`:

```bash
npm run launch:check
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' npm run launch:smoke
VALKEY_URL='redis://127.0.0.1:6379' npm run launch:smoke:valkey
```

`launch:check` runs the non-database pre-release checks. `launch:smoke` requires a migrated PostgreSQL database and exercises the core HTTP flow against real Prisma. `launch:smoke:valkey` is explicitly opt-in and checks the production Lua script, sliding-window boundary behavior, multi-key atomicity, and retry-after values against a real Redis or Valkey server. Ordinary test runs skip it and make no network connection.

## Current Scope

The local product supports email-code login, persisted profiles, host listing submission,
administrator review, approved public listings, two-sided host/renter messages, viewing requests
and host decisions, ranked roommate discovery, administrator-managed roommate profiles, reciprocal
matches, active deal rooms, and idempotent group-tour requests. Empty database tables produce
intentional empty states.

Online applications, payments, escrow, roommate direct messages, realtime updates, and production
hosting are not wired yet. Stripe, Mapbox, real email delivery, Redis queues, and production
moderation providers are also not connected.
