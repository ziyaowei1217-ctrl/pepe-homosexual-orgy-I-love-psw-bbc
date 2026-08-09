# Roommate Realtime Messaging Design

## Summary

Replace the browser-local roommate DM demo with authenticated, durable, one-to-one messaging between real users who have mutually liked each other. PostgreSQL is the source of truth, HTTP commands perform durable writes, and Socket.IO publishes committed changes in real time. A disconnected user receives no email or browser push; unread messages remain in PostgreSQL and synchronize when the application is reopened.

This work also closes the identity gap between the current room discovery cards and authenticated users. Production discovery exposes only roommate profiles linked to real `User` records. Existing generated/demo candidates remain available only in local development and cannot participate in a real conversation.

## Confirmed Direction

- Only a mutual `LIKE` between two real users can create a private conversation.
- Production roommate discovery contains real registered users only.
- The first release supports text messages only.
- Messages include server timestamps, unread counts, sent state, read state, history pagination, retry, and reconnect synchronization.
- There is no email notification, Web Push, operating-system notification, attachment, group chat, typing indicator, message edit, message recall, or unverified online-presence indicator.
- Use NestJS, Socket.IO, PostgreSQL, Prisma, and the existing JWT authentication model.
- Use the Socket.IO Redis adapter when `VALKEY_URL` is configured. A single local API instance works without Valkey.
- Persist a message before publishing it. WebSocket delivery never substitutes for database durability.
- HTTP performs message and read-cursor writes; Socket.IO distributes committed events.

## Current State

The repository currently has two roommate profile paths:

- `RoommateProfile` drives the ranked discovery deck and contains locally seeded candidates plus a server-only `localReciprocalLike` shortcut.
- `RoommateMatchingProfile` stores richer profile preferences under an email-linked `Profile`, but it is not the source used by the ranked deck.

`RoommateAction` currently points from an authenticated `User` to a discovery `RoommateProfile`. A reciprocal local flag can create a one-sided `DealRoom`, but there is no real second authenticated participant.

The Messages screen already persists listing-owner conversations through `DealThread` and `DealMessage`. Roommate messages, by contrast, are kept in browser storage by `lib/roommate-dm.ts`. They have no server authorization, multi-device synchronization, or realtime transport.

## Scope Decomposition

The implementation has four bounded units:

1. **Real roommate identity and mutual-match creation** — bind discovery profiles to authenticated users and create one canonical match per user pair.
2. **Durable conversation API** — list conversations, page messages, send idempotently, and advance read cursors.
3. **Realtime event transport** — authenticate Socket.IO connections and publish committed message/conversation/read events to user-scoped rooms.
4. **Messages UI integration** — replace local roommate DM storage with API state, realtime updates, unread badges, read receipts, and reconnect recovery.

Existing listing conversations remain on their current REST-backed path. The new roommate conversation domain is separate so its mutual-match authorization does not become tangled with host/renter listing rules.

## Canonical Identity And Discovery

### Authenticated ownership

Add an optional unique `ownerId` relation from `RoommateProfile` to `User`. A profile with an owner is a real chat-capable profile. A profile without an owner is a development/demo candidate.

The production roommate queries require `ownerId IS NOT NULL`, exclude the requesting user's own profile, and never expand real profiles into generated variants. Development may continue to show ownerless seeded cards for layout and ranking exercises, but actions on those cards cannot create a real match or conversation.

The existing richer `RoommateMatchingProfile` path is not dropped destructively in this feature. Its authenticated create/update operation projects the user-facing fields into the owned `RoommateProfile`, making the deck model the canonical chat identity while keeping old rows readable during migration. A later cleanup may remove the redundant legacy table after deployed data has been verified.

### Mutual actions

Keep `RoommateAction`, but reciprocal matching is based on authenticated ownership rather than `localReciprocalLike`:

1. User A likes the profile owned by User B.
2. The service finds User A's owned roommate profile.
3. The service checks whether User B has an active `LIKE` action targeting User A's profile.
4. If both actions are `LIKE`, one normalized `RoommateMatch` is created for the pair.
5. The match and its conversation are created in the same database transaction.

Self-actions are rejected. `PASS` or `LATER` never creates a match. Repeated actions are idempotent. The normalized pair is ordered lexicographically and protected by a unique database constraint so concurrent reciprocal likes cannot create duplicate matches.

The local `localReciprocalLike` behavior may continue to create existing demo `DealRoom` state in development, but it cannot create a real private conversation because no second authenticated user exists.

## Data Model

### RoommateProfile changes

- `ownerId String? @unique`
- `owner User?`
- indexes supporting active real-profile discovery

The public serializer never exposes email, internal user IDs, or demo-only reciprocal flags. It may expose an opaque action target ID that continues to be the roommate profile ID.

### RoommateMatch

- `id`
- `firstUserId`
- `secondUserId`
- `status` (`ACTIVE` or `CLOSED`)
- `matchedAt`
- `createdAt`
- `updatedAt`
- unique `(firstUserId, secondUserId)`
- indexes for each participant and status

The service always stores the lower user ID as `firstUserId`. Both users are equal participants; field ordering carries no product meaning.

### RoommateConversation

- `id`
- `matchId @unique`
- `lastMessageAt`
- `createdAt`
- `updatedAt`

A conversation cannot exist without a match. Closing a match makes the conversation read-only but preserves history.

### RoommateConversationMember

- `conversationId`
- `userId`
- `lastReadMessageId?`
- `lastReadAt?`
- `joinedAt`
- unique `(conversationId, userId)`

Exactly two members are inserted when the conversation is created. Membership is always checked on the server.

### RoommateMessage

- `id`
- `conversationId`
- `senderId`
- `clientMessageId`
- `body`
- `createdAt`
- unique `(senderId, clientMessageId)`
- indexes on `(conversationId, createdAt, id)` and `senderId`

`clientMessageId` makes retries safe. The server trims the body, rejects empty content, enforces a 2,000-character limit, and supplies the authoritative timestamp.

### Message state

- `sending` exists only in the browser before the server responds.
- `sent` means the message transaction committed.
- `failed` exists only in the browser and can be retried with the same `clientMessageId`.
- `read` is derived when the recipient's read cursor reaches the message.

The schema does not store a mutable status on every message. Read cursors avoid write amplification and make unread counts deterministic.

## HTTP API

All routes require the existing bearer JWT and reload the current user through the existing authentication guard.

### `GET /api/v1/roommate-conversations`

Returns the current user's conversations ordered by latest activity. Each item contains:

- conversation and match IDs;
- the other participant's public profile snapshot;
- the latest message summary;
- unread count;
- the current user's and peer's read positions;
- whether the conversation is writable.

No raw email address or internal authorization field is returned.

### `GET /api/v1/roommate-conversations/:id/messages`

Accepts `limit` and an opaque keyset cursor. It returns messages newest-first at the transport boundary plus `nextCursor`; the frontend renders the page chronologically. The maximum page size is 100.

Membership is checked before returning whether the conversation exists, preventing ID probing.

### `POST /api/v1/roommate-conversations/:id/messages`

Accepts:

```json
{
  "clientMessageId": "uuid",
  "body": "text"
}
```

The command checks active match membership, validates and rate-limits the body, inserts idempotently, updates `lastMessageAt`, commits, and then publishes realtime events. A retry with the same sender and client ID returns the original message.

### `POST /api/v1/roommate-conversations/:id/read`

Accepts the last visible message ID. The server verifies that the message belongs to the conversation and advances the cursor monotonically. Older or repeated read reports are harmless. A user cannot mark another participant's cursor.

### Match response

`POST /api/v1/roommates/:id/actions` keeps its current action contract and adds match/conversation metadata when a real reciprocal match is created or already exists. Existing clients can ignore the additive fields.

## Realtime Transport

### Connection authentication

The Socket.IO client sends the current bearer token in the handshake auth payload. The gateway verifies the JWT with the existing secret, loads the user from PostgreSQL, and rejects invalid or deleted users. Allowed origins use the same configured web-origin policy as HTTP CORS.

Each accepted socket joins only `user:<authenticatedUserId>`. Clients cannot provide arbitrary room names or subscribe to another user's channel.

### Server events

- `roommate.conversation.created`
- `roommate.conversation.updated`
- `roommate.message.created`
- `roommate.message.read`
- `roommate.unread.updated`

Every event contains stable entity IDs and committed server timestamps. Events contain only data the receiving user is authorized to read.

### Delivery ordering and recovery

The database transaction commits before an event is emitted. Socket delivery is best effort, not a durability guarantee. On initial load, reconnect, token refresh, browser focus, or detected sequence gap, the client refetches conversation summaries and fetches messages after its latest known cursor. Duplicate events and HTTP results are merged by stable message ID.

In a single API process, the gateway emits directly. When `VALKEY_URL` is configured, the Socket.IO Redis adapter broadcasts between API processes. A Valkey outage must not reject durable HTTP message writes; it produces a logged realtime-delivery failure and clients recover through synchronization.

## Frontend Experience

### Inbox

The existing Messages screen remains the unified inbox. Listing conversations and roommate conversations keep distinct domain types but share visual primitives.

Roommate conversation rows show:

- peer display name and avatar;
- latest message preview and time;
- unread badge;
- selected state;
- an empty-history prompt for a new match.

The global Messages navigation badge is the sum of unread listing state already available to the client and server-backed roommate unread counts. The roommate side never reads or writes `localStorage` message threads after migration.

### Conversation behavior

- Sending creates an optimistic bubble with `sending` state.
- The HTTP response replaces the optimistic bubble by `clientMessageId`.
- Failure changes it to `failed`; retry reuses the same ID.
- A realtime duplicate is ignored by message ID.
- New messages append immediately when the active conversation is at the bottom.
- If the user is reading older content, a non-disruptive new-message indicator appears instead of forcing scroll.
- Read state advances only while the conversation is selected and the document is visible.
- The latest outgoing message shows `已发送` or `已读`; older outgoing messages do not repeat redundant labels.
- Reopening the application loads summaries first, then the selected conversation history.

No online dot, typing animation, or delivery promise is displayed without a durable source of truth.

## Security And Abuse Controls

- JWT authentication is required for every HTTP and Socket.IO entry point.
- Conversation authorization is derived only from database membership.
- Mutual-match creation and conversation creation are transactional and uniquely constrained.
- Empty messages and messages longer than 2,000 characters are rejected.
- Message commands receive a per-user and per-conversation rate limit. The first release uses an in-process limiter locally and the existing Valkey-backed mechanism when configured.
- DTO validation rejects unknown fields.
- Error responses do not reveal whether an inaccessible conversation or message ID exists.
- WebSocket logs use request/socket IDs and user IDs, never message bodies or tokens.
- Public roommate serializers omit emails, authenticated user IDs, and internal reciprocal/demo flags.
- HTML is never accepted; React renders message bodies as text.
- Closed matches preserve readable history but reject new messages.

Blocking, reporting, moderation providers, legal retention controls, and end-to-end encryption are explicitly outside this release. Their absence must not be represented as if the chat were moderation-complete or end-to-end encrypted.

## Error Handling

- Database failure: return a failed send; do not emit a realtime event.
- Socket publish failure after commit: return the committed message successfully, log the publish failure, and rely on peer synchronization.
- Duplicate send: return the existing message without broadcasting a second logical message.
- Expired JWT: HTTP returns `401`; the socket disconnects and reconnects only after the client obtains a valid token.
- Revoked or closed match: history remains visible, send returns `409` or `403` without changing data.
- Stale read cursor: ignore or return the current cursor; never move read state backward.
- Reconnect gaps: refetch summaries and keyset-paginated history, then merge by ID.
- Valkey unavailable: the API stays able to persist messages in a single process and reports degraded cross-instance realtime health.

## Testing And Acceptance

### Unit and service tests

- normalized pair ordering and concurrent mutual-like idempotency;
- self-like rejection and non-mutual action behavior;
- production exclusion of ownerless demo profiles;
- conversation membership enforcement;
- message trimming, empty/length rejection, rate limiting, and client-ID idempotency;
- monotonic read cursors and unread-count calculation;
- cursor pagination without duplicates or gaps;
- publish-after-commit ordering and publish-failure durability.

### HTTP and WebSocket integration tests

- two authenticated real users mutually like and receive one shared conversation;
- a third user cannot list, read, send to, mark read in, or join that conversation;
- both connected participants receive one committed message event;
- the sender receives the same logical message across HTTP acknowledgement and socket event;
- a disconnected recipient later fetches the persisted unread message;
- opening the conversation advances the recipient cursor and pushes a read event to the sender;
- reconnect plus history synchronization produces no missing or duplicate message;
- invalid/expired socket tokens are rejected;
- configured Valkey adapter behavior is covered by an opt-in integration smoke test.

### Frontend tests

- server conversations replace local roommate DM threads;
- optimistic send resolves by `clientMessageId` and failed send can retry;
- realtime duplicates are deduplicated;
- unread badges and latest-message previews update;
- read reporting occurs only for the active visible conversation;
- reconnect triggers summary/history synchronization;
- narrow and desktop inbox layouts retain their current navigation behavior.

### Completion gate

- frontend tests, lint, typecheck, and production build pass;
- API tests, typecheck, build, and Prisma validation pass;
- a migrated PostgreSQL smoke test proves mutual match, durable send, offline fetch, and read cursor behavior;
- a real Socket.IO client smoke test proves authenticated realtime delivery;
- the existing listing-message and viewing-request workflows remain green;
- no user-owned unrelated workspace files are modified.

## Rollout And Compatibility

The database migration is additive. Existing ownerless `RoommateProfile` rows remain valid development/demo records. Production queries filter them out. Existing browser-local roommate DM data is not uploaded because it has no trustworthy authenticated peer identity; the UI stops reading it after the server-backed rollout.

Socket.IO and Valkey settings are optional outside production. Production startup validates the configured web origin and realtime environment. The HTTP synchronization path remains functional during transient socket or Valkey failures.

The first deployment should enable the feature behind a server-provided capability flag until the migration, multi-user smoke test, and socket health check pass. Once enabled, mutual matches create server conversations and the frontend removes the local-DM fallback for those users.

## Non-Goals

- Email, SMS, browser, or operating-system notifications.
- Images, files, voice notes, reactions, message editing, or recall.
- Group chat.
- Typing indicators or presence badges.
- End-to-end encryption.
- Blocking/reporting UI or third-party moderation.
- Payments, Stripe, maps, applications, or escrow.
- Realtime conversion of existing listing-owner `DealThread` messages.
