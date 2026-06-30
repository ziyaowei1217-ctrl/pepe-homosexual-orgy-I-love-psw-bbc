# Auth Session Hardening Design

## Summary

Harden authenticated request handling so JWTs prove identity, while the database remains the source of truth for current user state. This prevents stale tokens from preserving deleted users or old admin roles during launch testing.

## Confirmed Direction

- Continue backend launch hardening on the existing `codex/backend-launch-readiness` branch.
- Scope is backend-only.
- Keep the current JWT login flow and seven-day token lifetime.
- Avoid adding a full session or token-revocation subsystem in this slice.

## Recommended Approach

Update `AuthGuard` to verify the bearer token, then load the current `User` by `payload.sub` from Prisma.

The guard should attach the database user to `request.user`. It should not trust `email` or `role` values from the JWT payload after verification. If the user no longer exists, the request should fail with `401 Unauthorized`.

This gives the backend immediate role-change behavior without introducing new tables or deployment dependencies.

## Goals

- Keep JWT signature and expiration verification through `JwtService`.
- Require a valid `sub` claim.
- Fetch the current user by `sub`.
- Reject authenticated requests when the user record no longer exists.
- Use the database user's `id`, `email`, and `role` in `AuthenticatedRequest`.
- Make admin authorization depend on the current database role, not the role embedded in an older token.
- Keep existing HTTP launch-readiness and smoke tests passing.

## Tests

Add focused `AuthGuard` tests that prove:

- Missing bearer tokens still return `401`.
- Invalid tokens still return `401`.
- Valid tokens for missing users return `401`.
- Valid tokens attach the current database user.
- A token carrying a stale `ADMIN` role is downgraded to the current database `USER` role on the request.

Update the in-memory launch Prisma mock so HTTP e2e tests continue to use the same guard behavior as production.

## Out Of Scope

- Refresh tokens.
- Session tables.
- Token revocation lists.
- Password login.
- Email change workflow.
- Audit logging.

## Acceptance Criteria

- Authenticated routes use current database user identity and role.
- Deleted users or tokens for missing users receive `401`.
- Stale JWT roles do not preserve admin access.
- Existing admin guard behavior still works because it reads `request.user.role`.
- `npm run launch:check` from `api` passes.
- Real Postgres smoke passes when Docker Postgres is available.
