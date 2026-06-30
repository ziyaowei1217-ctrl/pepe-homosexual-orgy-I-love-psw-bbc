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

## Run Web

Install dependencies with the package manager available on your machine:

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Run API

Install Docker Desktop or run PostgreSQL locally, then:

```bash
docker compose up -d db
cp api/.env.example api/.env
pnpm --dir api prisma migrate dev --name init
pnpm --dir api dev
```

API base URL: `http://localhost:4000/api/v1`.

The frontend uses `NEXT_PUBLIC_API_BASE_URL`; by default it points to `http://localhost:4000/api/v1`.

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

The API supports email-code login, JWT sessions, listing creation/update, listing reads, roommate actions, active deal rooms, idempotent group-tour requests, and database-backed reads with seed fallback for groups, trips, and trust queues. Stripe, Mapbox, real email delivery, Redis queues, and production moderation providers are not wired yet.
