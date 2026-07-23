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

## Run Web Only

Install dependencies with the package manager available on your machine:

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Run API Manually

Install Docker Desktop or run PostgreSQL locally, then:

```bash
docker compose up -d db
cp api/.env.example api/.env
pnpm --dir api prisma migrate dev --name init
pnpm --dir api dev
```

API base URL: `http://localhost:4000/api/v1`.

The frontend uses `NEXT_PUBLIC_API_BASE_URL`; by default it points to `http://localhost:4000/api/v1`.

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
```

`launch:check` runs the non-database pre-release checks. `launch:smoke` requires a migrated PostgreSQL database and exercises the core HTTP flow against real Prisma.

## Current Scope

The API supports email-code login, JWT sessions, listing creation/update, listing media metadata, listing reads, roommate deck ranking, admin roommate profile management, roommate actions, active deal rooms, idempotent group-tour requests, and database-backed reads with seed fallback for groups, trips, and trust queues. Stripe, Mapbox, real email delivery, Redis queues, and production moderation providers are not wired yet.
