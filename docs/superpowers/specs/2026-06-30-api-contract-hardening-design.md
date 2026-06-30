# API Contract Hardening Design

## Summary

Harden the existing backend API contract around launch-critical write paths. The focus is not new product scope; it is making current listing and review endpoints reject malformed input consistently before data reaches Prisma, while preserving the existing listing review state machine and public visibility rules.

This slice targets practical pre-release testing: bad strings, bad numbers, unexpected client fields, invalid review reasons, and state transitions that should stay server-owned.

## Confirmed Direction

- User approved continuing backend launch-hardening work.
- Scope is backend-only.
- Use the existing NestJS `ValidationPipe`, class-validator DTOs, Prisma services, Vitest, and Supertest setup.
- Keep normal tests runnable without a local database.
- Keep optional real-Postgres smoke coverage available through the existing launch scripts.

## Recommended Approach

Use DTO validation as the HTTP boundary and service-layer checks as the persistence/state boundary.

The controller DTOs should reject malformed requests early with 400 responses. The services should continue to own review status, owner identity, reviewer metadata, and persisted update fields so direct service calls or future controllers cannot bypass the listing workflow.

## Goals

### Listing Write Contract

Split listing write input into explicit DTOs:

- `CreateListingDto` requires all listing fields needed to create a draft listing.
- `UpdateListingDto` accepts only editable listing content fields and requires at least one valid field.
- Review/status metadata remains server-owned and unavailable to client DTOs.

Validation should cover:

- Required text fields are trimmed and non-empty.
- Text fields have bounded lengths.
- `image` must be a URL.
- `price` and `originalPrice` must be positive integers within a practical upper bound.
- `beds` and `baths` must be integers within a practical residential range.
- `score`, when present, must remain between 0 and 5.
- `tags` must be a non-empty bounded array of trimmed non-empty strings.
- Extra fields are rejected by the existing global `forbidNonWhitelisted` pipe.

### Review Contract

The admin rejection endpoint should require a trimmed non-empty reason with a bounded length. The service should still trim the reason before persisting it.

### State And Ownership Safeguards

Keep existing state behavior:

- New listings are always created as `DRAFT`.
- Owners can edit or submit only their own `DRAFT` or `REJECTED` listings.
- Owners cannot edit `SUBMITTED` or `APPROVED` listings.
- Public reads expose only `APPROVED` database listings.
- Admin review can approve or reject only `SUBMITTED` listings.
- Client-provided status or review metadata must not affect persistence.

### Tests

Add HTTP-level validation tests because malformed payload behavior depends on Nest's global validation pipe. Add service tests only where persistence/state behavior is being protected.

The tests should prove:

- Empty or whitespace-only listing text fails at HTTP boundary.
- Invalid image URL fails.
- Non-integer or out-of-range numeric fields fail.
- Empty tags fail.
- Extra fields such as `status`, `reviewerId`, or `rejectionReason` fail at HTTP boundary.
- Partial update accepts one valid editable field.
- Empty update payload fails.
- Rejection reason is trimmed and bounded.
- Existing launch-readiness flow still passes.

## Out Of Scope

- Adding new product domains.
- Payment, escrow, subscription, or Stripe work.
- Realtime chat or notifications.
- Changing the database schema.
- Changing public seed fallback behavior.
- Admin UI or frontend validation.
- Dropping, truncating, or resetting a shared database.

## Acceptance Criteria

- Listing create and update endpoints reject malformed payloads with 400 responses.
- Review rejection rejects blank or overlong reasons with 400 responses.
- Client attempts to set server-owned review/status fields are rejected at the HTTP boundary.
- Service-layer listing status, owner, and reviewer safeguards remain covered.
- Existing launch readiness tests continue to pass.
- `npm run launch:check` from `api` passes.
- Optional real-Postgres smoke still passes when `RUN_DB_SMOKE=1` and a migrated Docker Postgres is available.
