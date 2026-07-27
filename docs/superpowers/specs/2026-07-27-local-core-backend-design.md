# Local Core Backend Completion Design

## Summary

Complete the first backend phase of Sublet Pipeline as a durable local product environment. The existing NestJS and Prisma services remain the foundation, but the product stops relying on in-process seed fallbacks and one-sided workflow records. PostgreSQL becomes the only business-state source for authentication, listings, messages, viewing requests, roommate actions, deal rooms, and review decisions.

The finished local environment supports three real browser roles:

- renters can browse approved database listings, message a host, request a viewing, and use roommate matching;
- hosts can create and submit listings, receive and reply to renter messages, and confirm or decline viewing requests;
- administrators can review submitted listings and approve or reject them.

Development email codes are returned to the local browser. Real email delivery, payments, escrow, applications, realtime transport, and production deployment remain outside this phase.

## Confirmed Direction

- Keep the current Next.js, NestJS, Prisma, PostgreSQL, JWT, Vitest, and Supertest stack.
- Harden the current `/listings`, `/deal-threads`, `/roommates`, `/deal-rooms`, `/profiles`, and `/auth` contracts instead of migrating the frontend to the separate `HousingListing` API.
- Run PostgreSQL through the repository's Docker Compose configuration.
- Store every sensitive workflow transition in PostgreSQL before presenting success in the frontend.
- Use explicit database seeding for local development; never return code-defined business records merely because a table is empty.
- Configure administrator email addresses through local environment variables rather than hard-coded product accounts.
- Preserve the existing four-stage listing lifecycle: `DRAFT`, `SUBMITTED`, `APPROVED`, and `REJECTED`.
- Preserve the current roommate actions: `LIKE`, `PASS`, and `LATER`.
- Only selected locally seeded roommate candidates have a server-side reciprocal-like state. Other likes remain pending.
- Add a minimal administrator review experience so local publishing can complete the full submit-to-public loop.
- Add true two-sided host/renter messages and viewing decisions.

## Goals

### Durable Local Environment

One setup command starts PostgreSQL, applies committed migrations, creates local database records, and writes no runtime business state to the browser beyond device-scoped favorites and reminders.

One development command starts the web application and API together. Restarting the web or API process does not remove users, profiles, listings, messages, viewing requests, roommate actions, deal rooms, or review decisions.

### Authentication And Profiles

The existing email-code login remains the authentication entry point.

In development:

- requesting a code persists a hashed, expiring verification record;
- the API response includes `devCode`;
- the frontend shows that code only in the development login interface;
- verifying the code creates or reuses the authenticated `User`;
- verifying the code also creates or reuses the email-linked `Profile`;
- email addresses included in `LOCAL_ADMIN_EMAILS` receive the `ADMIN` user role;
- no admin identity is hard-coded into application source.

In production mode, the current fail-closed behavior remains: a real email sender and a non-default JWT secret are required.

### Listings And Review

The current `Listing` model and DTO remain the canonical contract for the first phase.

Public reads return only `APPROVED` database listings. Empty tables return an empty array or a not-found response; they never return `seedListings`.

Host operations remain:

- create a `DRAFT` listing;
- list the authenticated owner's listings;
- edit only `DRAFT` or `REJECTED` listings;
- append media only to editable listings;
- submit an editable listing for review.

Administrator operations remain:

- list `SUBMITTED` listings;
- approve a submitted listing;
- reject a submitted listing with a non-empty reason.

The administrator frontend displays the service-backed review queue and requires confirmation before approve or reject. A successful decision refreshes both the review queue and the public catalog. A failed request leaves the review item and form state visible.

### Two-Sided Listing Conversations

A listing conversation represents one renter contacting one approved listing.

The server, rather than the client, determines:

- the listing title and area;
- the listing owner;
- the renter;
- the visible contact name for each participant;
- the authorized participants;
- the associated roommate group, when present.

The client may submit a listing ID and optional active deal-room ID, but it cannot overwrite an existing conversation's listing owner, renter, contact identity, participant list, or deal-room binding.

Conversation access is granted only to:

- the renter who created the thread; and
- the owner of the associated listing.

The renter can create or reuse a conversation. The host can list conversations addressed to owned listings. Both participants can send messages. The API computes message alignment relative to the current viewer instead of trusting a stored client-provided alignment value.

Conversation uniqueness remains one thread per renter and listing. Multiple renters may independently contact the same host listing.

If a conversation is already bound to one deal room, a request with a different deal-room ID returns `409 Conflict` and leaves the existing thread unchanged.

### Viewing Requests

Viewing requests belong to a listing conversation.

The renter may:

- create a request with a selected time, mode, and participant names;
- adjust an existing `REQUESTED` or `CONFIRMED` request.

The host may:

- confirm a `REQUESTED` viewing;
- decline a `REQUESTED` or `CONFIRMED` viewing, producing `CANCELLED`.

The server authorizes each transition from the thread participants and listing ownership. A renter cannot confirm their own request, and a host cannot act on a request for another host's listing.

Each active conversation has at most one active viewing request. Repeated renter submissions update that active request instead of creating duplicates. Completed or cancelled records remain historical.

Messages and the renter's Trips page consume the same service-backed viewing records. The host message workspace exposes confirm and decline controls only for actionable requests.

### Roommate Actions And Reciprocal Matches

Roommate candidates are explicit database records created by the local seed command.

Each candidate includes a server-owned local reciprocal-like flag. The public roommate response does not expose that implementation flag.

Actions are idempotent per authenticated user and roommate candidate:

- `PASS` and `LATER` update the action and never create a deal room;
- `LIKE` records the action;
- `LIKE` returns no deal room when the candidate is not reciprocal;
- `LIKE` creates or returns one active deal room when the candidate is reciprocal.

The response therefore remains the authoritative signal for whether a mutual match exists. Repeated likes never duplicate actions, rooms, or members.

This reciprocal flag is only the local first-phase matching mechanism. It is intentionally isolated in the roommate service so a later user-to-user reciprocal-like model can replace it without changing frontend behavior.

## Data Model

### User And Profile

Keep `User` as the authenticated identity and `Profile` as the product profile for this phase. Authentication must upsert both records by normalized email.

`LOCAL_ADMIN_EMAILS` is parsed as a comma-separated, normalized allowlist. On successful verification, an allowlisted user is promoted to `ADMIN`, an existing administrator remains an administrator, and a newly created non-allowlisted user receives `USER`.

### Listing Conversation Ownership

Retain `DealThread.ownerId` as the renter/requester identity for compatibility, and add:

- a required relation from `DealThread.listingId` to `Listing.id`;
- a required `listingOwnerId` relation to `User.id`, derived from the listing at creation;
- an index for host inbox reads on `(listingOwnerId, updatedAt)`.

The unique constraint remains `(ownerId, listingId)`.

This first-phase migration requires a clean local database because legacy development threads may reference preview-only listing IDs. The setup command checks for incompatible legacy thread rows and exits with instructions to use a new repository-owned local database volume. It never drops, truncates, or resets an arbitrary external database.

### Messages

Keep `DealMessage.senderId`, `senderName`, `body`, `status`, and `createdAt`.

The persisted `align` field becomes non-authoritative for reads. Thread serialization derives:

- `right` when `senderId` equals the requesting user;
- `left` otherwise.

### Viewing Requests

Use the existing `ViewingRequestStatus` values:

- `REQUESTED`;
- `CONFIRMED`;
- `COMPLETED`;
- `CANCELLED`.

Do not add separate host-decision timestamps in this phase. `updatedAt` records the decision time. Status transitions are implemented in the viewing service and tested independently.

### Roommate Candidates

Add a server-owned Boolean field to `RoommateProfile` for local reciprocal matching, defaulting to `false`. The seed command sets it to `true` for a small, deterministic subset.

The field is omitted from public roommate API responses.

## API Design

### Authentication

Existing routes remain:

- `POST /api/v1/auth/email-code`;
- `POST /api/v1/auth/verify-email`;
- `GET /api/v1/auth/me`.

`verify-email` returns the current persisted role after applying the local administrator allowlist.

### Listings

Existing routes remain:

- `GET /api/v1/listings`;
- `GET /api/v1/listings/:id`;
- `GET /api/v1/listings/mine`;
- `POST /api/v1/listings`;
- `PATCH /api/v1/listings/:id`;
- `POST /api/v1/listings/:id/media`;
- `POST /api/v1/listings/:id/submit`;
- `GET /api/v1/admin/listings/review-queue`;
- `POST /api/v1/admin/listings/:id/approve`;
- `POST /api/v1/admin/listings/:id/reject`.

Public listing reads never fall back to code-defined records.

### Conversations

Keep the current base routes:

- `GET /api/v1/deal-threads`;
- `POST /api/v1/deal-threads`;
- `POST /api/v1/deal-threads/:id/messages`;
- `POST /api/v1/deal-threads/:id/viewing-requests`.

`GET /deal-threads` returns every thread where the current user is either the renter or listing owner. Each response includes a viewer-relative contact name, messages, viewing requests, `viewerRole`, and listing context.

`POST /deal-threads` accepts:

```json
{
  "listingId": "listing-id",
  "dealRoomId": "optional-owned-active-room-id"
}
```

Legacy client-supplied listing title, area, contact name, and participant names are ignored or rejected after the frontend contract is migrated. The server reads them from the listing, profile, and selected room.

Add host viewing routes:

- `POST /api/v1/deal-threads/:threadId/viewing-requests/:requestId/confirm`;
- `POST /api/v1/deal-threads/:threadId/viewing-requests/:requestId/decline`.

### Roommates

Existing routes remain:

- `GET /api/v1/roommates`;
- `POST /api/v1/roommates/:id/actions`;
- `GET /api/v1/deal-rooms/active`.

Public reads return database candidates only and omit the reciprocal-like flag.

## Frontend Integration

### Authentication

The login panel continues to request and verify codes. It displays `devCode` only when the API returns it. Authentication failures preserve the email or code input and use the existing Chinese product-error mapping.

### Catalog And Publishing

With preview data disabled, the catalog reads approved API listings. An empty database produces an intentional empty state.

The host publishing wizard continues to use the existing draft, media, and submit sequence. Remote listing IDs remain the idempotency boundary.

### Messages And Viewings

The inbox consumes viewer-relative thread responses:

- renters see the host as the contact;
- hosts see the renter as the contact;
- message alignment is already correct for the viewer;
- hosts see confirm and decline controls for actionable viewing requests;
- renters see the resulting status but cannot perform host decisions.

Message drafts and selected viewing slots remain on failure. Thread and request state update only after successful API responses.

### Administrator Review

The Trust workspace gains an authenticated review section:

- non-admin users see no administrator actions;
- admins see submitted listings from the review queue;
- approve requires explicit confirmation;
- reject requires a reason and explicit confirmation;
- successful decisions refresh the queue.

Static future Trust modules remain labeled unavailable and do not fabricate review counts.

## Local Development Workflow

### Environment

Create a local API environment file from the committed example with:

- PostgreSQL connection URL;
- development JWT secret;
- console email sender;
- web origin;
- optional comma-separated `LOCAL_ADMIN_EMAILS`.

No real credentials are committed.

### Setup Command

Add a root command that:

1. starts the repository's PostgreSQL Docker service;
2. waits for database readiness;
3. applies committed Prisma migrations;
4. executes an idempotent local seed command.

The seed command creates:

- approved public listings;
- roommate candidates with both reciprocal and non-reciprocal examples.

The seed command does not create fixed renter, host, or administrator login accounts.

### Development Command

Add a root command that starts the Next.js frontend and NestJS API concurrently using their existing ports:

- web: `http://localhost:3000`;
- API: `http://localhost:4000/api/v1`.

The command does not enable frontend preview listings. All visible business records come from PostgreSQL.

## Error Handling And Security

- Missing or expired authentication returns `401`.
- Non-admin review access returns `403`.
- Resource ownership failures return `404` to avoid leaking existence.
- Invalid state transitions return `400`.
- Deal-room binding conflicts return `409`.
- Duplicate operations use database uniqueness plus idempotent service logic.
- DTO validation trims strings, rejects unknown fields, limits array sizes, and bounds message and rejection lengths.
- The server never trusts client-supplied owner IDs, sender IDs, review status, listing status, participant identity, or message alignment.
- API responses do not expose verification hashes, reciprocal seed flags, JWT secrets, or internal exception details.
- Production configuration continues to fail closed when JWT or email delivery is missing.

## Testing Strategy

All production behavior is implemented test-first.

### Unit And Service Tests

Cover:

- authentication upserts `User` and `Profile`;
- local admin allowlist assignment;
- empty listing and roommate tables return empty results;
- public responses omit reciprocal matching flags;
- reciprocal and non-reciprocal roommate likes;
- action, deal-room, and room-member idempotency;
- server-derived thread participants and listing context;
- renter and host thread visibility;
- third-party thread denial;
- deal-room conflict protection;
- viewer-relative message alignment;
- viewing create, adjustment, confirm, decline, and invalid transitions;
- listing review ownership and state transitions.

### HTTP Tests

Use two normal users and one administrator to prove:

- host creates and submits a listing;
- non-admin review access is rejected;
- admin approves the listing;
- approved listing becomes public;
- renter creates a thread for that listing;
- host sees and replies to the thread;
- renter requests a viewing;
- host confirms it;
- renter reads the confirmed state;
- another user cannot read or mutate the thread;
- reciprocal and pending roommate likes produce different results.

### Real PostgreSQL Smoke Test

The opt-in smoke test runs against the migrated local PostgreSQL database and cleans up only rows created by that test. It proves readiness, persistence, and the same host-to-renter flow through HTTP.

### Browser Regression

With preview data disabled:

1. log in as a host and set a host-capable profile;
2. create, edit, add media to, and submit a listing;
3. log in with an allowlisted administrator email and approve the listing;
4. log in as a renter and find the approved listing;
5. message the host and request a selected viewing time;
6. log back in as the host, reply, and confirm the viewing;
7. log back in as the renter and verify the reply and confirmed viewing;
8. like one pending and one reciprocal roommate candidate;
9. restart the API and verify all state remains.

## Out Of Scope

- Real email delivery.
- Realtime WebSocket or push updates; users refresh or revisit to see the other account's actions.
- Online applications.
- Payments, refunds, escrow, or financial ledgering.
- Roommate direct messages and explicit group-confirmation chat.
- Calendar provider integration.
- Production hosting, managed PostgreSQL, domains, secrets, or observability vendors.
- Migration to the parallel `HousingListing` and `RoommateMatchingProfile` product contracts.
- Destructive reset of an arbitrary user-managed database.

## Acceptance Criteria

- Local setup succeeds from documented prerequisites with Docker Desktop running.
- The web and API start together without frontend preview data.
- API tests, frontend tests, lint, typechecks, builds, Prisma validation, and the real-database smoke test pass.
- Empty business tables never cause code-defined listings, roommates, trips, groups, or Trust metrics to appear.
- Verification codes, users, profiles, listings, review decisions, messages, viewing requests, roommate actions, and deal rooms are persisted in PostgreSQL.
- The full host-to-admin-to-renter browser journey completes without local fake workflow success.
- Host and renter can exchange messages in the same server-backed conversation.
- Host can confirm or decline a renter viewing request.
- Pending and reciprocal roommate likes are visibly different and survive restart.
- Unauthorized users cannot access another user's listing drafts, conversations, viewing actions, deal rooms, or administrator review operations.
