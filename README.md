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
Local email codes are shown in the login panel. Add comma-separated administrator emails to
`LOCAL_ADMIN_EMAILS` in `api/.env`.

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

The local product supports email-code login, persisted profiles, host listing submission,
administrator review, approved public listings, two-sided host/renter messages, viewing requests
and host decisions, roommate actions, reciprocal matches, active deal rooms, and idempotent
group-tour requests. Empty database tables produce intentional empty states.

Online applications, payments, escrow, roommate direct messages, realtime updates, and production
hosting are not wired yet.
