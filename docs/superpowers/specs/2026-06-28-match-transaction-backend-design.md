# Match Transaction Backend Design

## Summary

Build the first production-shaped backend slice for the roommate-first product: persist roommate actions, create an active deal room when a user likes a roommate, and allow group tour requests only after the user is part of that deal room.

This turns the current frontend-only Match -> Deal Room -> Request group tour path into real API state without adding payment, real chat, map providers, or a full recommendation engine.

## Confirmed Direction

- User selected the "matching transaction loop" as the first backend phase.
- Scope is backend-first.
- Keep the existing NestJS + Prisma + PostgreSQL stack.
- Follow the current module style: controller + service + DTO + focused Vitest unit tests.
- Keep seed endpoints usable when the database has no roommate/listing rows.

## Product Behaviors

### Roommate Actions

Users can take one action per roommate profile:

- `LIKE`
- `PASS`
- `LATER`

Actions are idempotent by `(userId, roommateProfileId)`. Repeating an action updates the existing row rather than creating duplicates.

When the action is `LIKE`, the backend creates or returns an active deal room for that user and roommate.

### Deal Rooms

A deal room represents the post-like conversion space for one user and one matched roommate. It stores:

- owner user
- active roommate profile
- status
- members snapshot
- recommended homes snapshot
- pipeline state
- trust checklist snapshot

The first implementation uses deterministic snapshots built from the liked roommate and the best available listing data. This keeps the API useful before a full matching service exists.

### Tour Requests

A user can request a group tour only for a deal room they own. The endpoint is idempotent per deal room: repeated requests return the existing tour request.

The request status starts as `REQUESTED`.

## API Shape

### `POST /api/v1/roommates/:id/actions`

Auth required.

Request:

```json
{ "action": "LIKE" }
```

Response for `LIKE`:

```json
{
  "action": { "action": "LIKE", "roommateProfileId": "..." },
  "dealRoom": { "id": "...", "status": "ACTIVE", "canRequestTour": true }
}
```

Response for `PASS` or `LATER`:

```json
{
  "action": { "action": "PASS", "roommateProfileId": "..." },
  "dealRoom": null
}
```

### `GET /api/v1/deal-rooms/active`

Auth required. Returns the user's active deal rooms ordered by most recently updated.

### `POST /api/v1/deal-rooms/:id/tour-requests`

Auth required. Creates or returns a tour request for an owned deal room.

## Data Model

Add Prisma enums:

- `RoommateActionType`: `LIKE`, `PASS`, `LATER`
- `DealRoomStatus`: `ACTIVE`, `ARCHIVED`
- `TourRequestStatus`: `REQUESTED`, `SCHEDULED`, `CANCELLED`

Add Prisma models:

- `RoommateAction`
- `DealRoom`
- `DealRoomMember`
- `TourRequest`

Important constraints and indexes:

- `RoommateAction`: unique `(userId, roommateProfileId)`, indexes on `userId` and `roommateProfileId`.
- `DealRoom`: unique `(ownerId, roommateProfileId)`, index `(ownerId, status, updatedAt)`.
- `DealRoomMember`: unique `(dealRoomId, roommateProfileId)`, index on `dealRoomId`.
- `TourRequest`: unique `dealRoomId`, index `(requesterId, status, createdAt)`.

These follow the Postgres rule that frequently filtered and joined columns need indexes.

## Error Handling

- Missing or invalid JWT: existing `AuthGuard` returns 401.
- Unknown roommate ID: return 404.
- Invalid action value: return 400 through DTO validation.
- Tour request for another user's room: return 404 to avoid leaking existence.

## Testing

Add service-level Vitest tests before implementation:

- `LIKE` upserts a roommate action and creates an active deal room.
- Repeating `LIKE` returns the existing deal room instead of duplicating it.
- `PASS` and `LATER` do not create deal rooms.
- Tour request is idempotent per deal room.
- Tour request for another user's deal room throws `NotFoundException`.

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

## Out Of Scope

- Stripe, escrow, or payments.
- Real-time chat.
- Calendar provider integration.
- Full recommendation or ML ranking.
- Admin moderation UI.
- Database migration execution against a live database.
