# Seed-Backed Read Endpoints Design

## Summary

Persist the existing seed-only `groups`, `trips`, and `trust/queues` API reads behind the Prisma models that already exist in the schema. The endpoints should prefer database rows when present and keep their current seed fallback when the database is empty, preserving the demo experience while making the API useful for real data.

## Confirmed Direction

- Build the smallest durable backend slice rather than external integrations.
- Keep existing public routes and response shapes so the frontend does not need to change.
- Use the existing Prisma models: `Group`, `Booking`, and `TrustQueueItem`.
- Keep seed fallback behavior for empty tables.

## Goals

- `GET /api/v1/groups` returns database groups ordered by newest first when groups exist.
- `GET /api/v1/groups` returns `seedGroups` when the group table is empty.
- `GET /api/v1/trips` returns database bookings ordered by newest first when bookings exist.
- `GET /api/v1/trips` returns `seedTrips` when the booking table is empty.
- `GET /api/v1/trust/queues` returns database trust queue items ordered by newest update first when queue rows exist.
- `GET /api/v1/trust/queues` returns `seedTrustQueues` when the queue table is empty.
- Controllers delegate reads to focused services.
- Normal launch checks remain database-free.

## Architecture

Add three focused services:

- `GroupsService` reads `prisma.group.findMany({ orderBy: { createdAt: "desc" } })`.
- `TripsService` reads `prisma.booking.findMany({ orderBy: { createdAt: "desc" } })`.
- `TrustService` reads `prisma.trustQueueItem.findMany({ orderBy: { updatedAt: "desc" } })`.

Each service returns database rows when `findMany()` returns at least one record. Otherwise it returns the matching seed array from `api/src/seed-data.ts`. Controllers keep their current route names and simply call the service.

## Error Handling

Prisma errors should propagate to Nest's normal exception handling. The services should not silently fall back to seed data when the database query fails, because that would hide operational failures.

## Testing

Add service tests for each domain:

- Database rows are returned instead of seed data.
- Empty database rows fall back to seed data.
- The expected stable `orderBy` clause is sent to Prisma.

Add controller tests proving each controller delegates to its service. Existing launch HTTP coverage should continue to call these endpoints through the shared in-memory Prisma mock, so the mock needs `group`, `booking`, and `trustQueueItem` support if full API tests touch those routes.

## Out Of Scope

- CRUD endpoints for groups, bookings, or trust queue rows.
- Admin-only mutation flows.
- Seed initialization or import scripts.
- Payment, escrow, or Stripe booking semantics.
- Trust moderation provider integrations.

## Acceptance Criteria

- Focused tests for groups, trips, and trust queue reads pass.
- Existing HTTP launch readiness tests pass.
- `npm run launch:check` from `api` passes.
- The current frontend can still load groups, trips, and trust queue data without route changes.
