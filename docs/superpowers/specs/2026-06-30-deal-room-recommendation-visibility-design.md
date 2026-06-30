# Deal Room Recommendation Visibility Design

## Summary

Harden deal-room home recommendations so launch-critical match flows do not expose draft, submitted, or rejected listings. Public listing discovery already filters to approved homes; deal-room recommendations should follow the same visibility rule.

## Confirmed Direction

- Continue backend launch hardening on the existing branch.
- Scope is backend-only.
- Do not change the deal-room schema or matching product model.
- Keep the current seed-listing fallback for demo environments with no approved database homes.

## Recommended Approach

Update `DealRoomsService.buildRecommendedHomes()` to query only listings with `status: "APPROVED"` before ranking homes. If no approved database listings exist, keep the current seed fallback.

This mirrors public listing reads and prevents unreviewed user-created listings from appearing in a user's transaction room.

## Goals

- Deal-room recommendations use approved database listings only.
- Draft, submitted, and rejected database listings are ignored.
- Seed fallback remains available only when there are no approved database listings.
- Existing roommate action, active deal-room, and tour-request behavior remains unchanged.
- Existing launch-readiness and real-Postgres smoke flows still pass.

## Tests

Add focused service tests proving:

- Recommended homes exclude non-approved database listings.
- The Prisma query asks for `status: "APPROVED"`.
- Seed fallback still works when there are no approved database listings.

## Out Of Scope

- Re-ranking algorithm changes.
- Persisted recommendation refresh after listing status changes.
- New listing search APIs.
- Schema changes.
- Frontend changes.

## Acceptance Criteria

- `DealRoomsService` never creates new deal rooms with non-approved database listings in `recommendedHomes`.
- Existing deal-room behavior remains covered and passing.
- `npm run launch:check` from `api` passes.
- Real Postgres smoke passes when Docker Postgres is available.
