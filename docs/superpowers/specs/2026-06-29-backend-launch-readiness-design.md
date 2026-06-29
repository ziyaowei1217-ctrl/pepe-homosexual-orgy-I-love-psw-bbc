# Backend Launch Readiness Design

## Summary

Build a backend launch-readiness harness around the existing Sublet Pipeline API. The goal is to prove the current commercial backend slices can survive realistic pre-release testing: process health, database readiness, HTTP-level behavior, and an optional real-Postgres smoke flow.

This slice does not add new product domains. It makes the existing auth, listing review, roommate match, deal-room, and tour-request flows measurable through tests and scripts that a deploy pipeline can run.

## Confirmed Direction

- User chose backend launch readiness as the next priority.
- Scope is backend-only.
- Use the existing NestJS, Prisma, PostgreSQL, Vitest, Supertest, JWT, and npm scripts setup.
- Keep normal tests runnable without a local database.
- Add optional real-database smoke coverage that only runs when explicitly enabled.

## Goals

### Health And Readiness

Add operational endpoints under the existing API prefix:

- `GET /api/v1/health` returns process liveness without touching dependencies.
- `GET /api/v1/ready` checks whether the API can reach PostgreSQL.

The readiness response should be small and stable:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok"
  }
}
```

If the database check fails, `ready` should return a `503 Service Unavailable` response with `status: "error"` and `checks.database: "error"`.

### HTTP-Level Launch Flow

Add an HTTP e2e test that starts the Nest app with the same global prefix and validation settings as production bootstrap, but overrides Prisma with an in-memory test double so it runs without a database.

The HTTP test should cover:

- Requesting and verifying an email login code.
- Creating a listing as an owner.
- Confirming draft listings are not public.
- Submitting the listing for review.
- Rejecting non-admin review access.
- Approving the submitted listing as an admin.
- Confirming approved listings are public.
- Liking a roommate.
- Fetching the user's active deal room.
- Requesting a group tour idempotently.

This complements the existing service tests by proving controllers, guards, validation, global prefix, and request/response wiring behave together.

### Real Postgres Smoke Test

Add a smoke test that runs only when `RUN_DB_SMOKE=1` is set. It should use the real `AppModule` and real Prisma connection against `DATABASE_URL`.

The smoke flow should:

- Check `/api/v1/ready`.
- Create unique owner and admin users directly through Prisma.
- Sign JWTs with the app's `JwtService`.
- Create, submit, and approve a listing through HTTP.
- Confirm the approved listing is public through HTTP.
- Like a seeded roommate through HTTP.
- Fetch the created active deal room.
- Request a group tour.
- Clean up only rows created by the smoke test.

The smoke test assumes migrations have already been applied. It should not drop or reset the whole database.

### Launch Scripts

Add API scripts:

- `launch:check`: run test, typecheck, build, and Prisma validate.
- `launch:smoke`: run the optional database smoke test with `RUN_DB_SMOKE=1`.

Document the commands in the README so the pre-release path is discoverable.

## Out Of Scope

- Payments, escrow, Stripe, or subscriptions.
- Chat or realtime transport.
- Notification delivery.
- Real email provider integration.
- Admin review UI.
- Persisting seed-only `groups`, `trips`, or `trust` endpoints.
- Dropping, truncating, or resetting a shared database.

## Acceptance Criteria

- `GET /api/v1/health` returns an `ok` response.
- `GET /api/v1/ready` returns `ok` when Prisma can query the database and `503` when it cannot.
- Normal test suite runs without requiring PostgreSQL.
- HTTP e2e test proves the full launch-critical path through auth, listing review, roommate matching, deal-room fetch, and tour request.
- Optional DB smoke test is skipped by default and runs when `RUN_DB_SMOKE=1`.
- `npm run launch:check` from `api` completes the non-DB launch checks.
- `npm run launch:smoke` from `api` runs the DB smoke test.
- API tests, typecheck, build, and Prisma validate pass.
