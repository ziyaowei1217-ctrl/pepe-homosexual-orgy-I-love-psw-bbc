# Roommate Messaging Backend Launch Closure Design

## Summary

Close the launch-readiness gap in the durable roommate messaging backend without expanding the product surface or changing the frontend. PostgreSQL remains the source of truth, HTTP remains the only message command and recovery path, and Socket.IO remains a best-effort committed-event transport.

This work adds explicit infrastructure health, safe Valkey fallback, end-to-end verification against PostgreSQL 16 and real Socket.IO clients, an opt-in cross-instance Valkey smoke test, migration safety coverage, redacted operational logging, and documentation that matches the implemented backend.

## Confirmed Scope

### Goals

- Prove the existing real-user mutual-match and roommate conversation flow through public backend boundaries.
- Keep durable message writes available when Socket.IO or Valkey publication is unavailable.
- Fall back from distributed message rate limiting to a bounded in-process limiter instead of failing durable message writes.
- Expose database-critical readiness separately from degraded realtime and distributed-limit status.
- Verify an empty-database migration and a migration with existing ownerless development roommate profiles.
- Verify authenticated realtime delivery with real Socket.IO clients rather than service-only mocks.
- Prove cross-instance delivery with a real Valkey service when the opt-in smoke environment is available.
- Keep logs and health responses free of tokens, message bodies, email addresses, credentials, and connection URLs.
- Bring backend environment examples, local orchestration, launch commands, and README statements in line with reality.

### Non-goals

- No frontend integration or browser state changes.
- No new chat capability such as attachments, typing indicators, presence, message editing, recall, blocking, reporting, or moderation.
- No change to listing conversations or viewing workflows except regression verification.
- No requirement that Valkey be present for a single API instance.
- No change to PostgreSQL as the durable source of truth.
- No unrelated refactor and no modification of presentation, chart, output, or temporary artifacts.

## Current State And Gaps

The backend already has authenticated real roommate profile ownership, reciprocal match creation, durable conversation membership, idempotent HTTP message commands, monotonic read cursors, Socket.IO user rooms, optional Socket.IO Valkey fan-out, and Valkey-backed message rate limiting.

The remaining launch gaps are operational rather than new product behavior:

- the current readiness response covers only PostgreSQL and cannot describe messaging transport degradation;
- Socket.IO adapter fallback is not represented in application health;
- a configured but unavailable Valkey rate-limit store can currently reject an otherwise durable message write;
- the launch suite does not yet prove the full two-user offline/reconnect/read flow through a real PostgreSQL database and real Socket.IO client;
- cross-instance Socket.IO delivery is unit-tested at the adapter boundary but has no opt-in real Valkey smoke journey;
- migration verification needs an explicit existing-ownerless-profile scenario;
- README still says roommate direct messages and realtime updates are not wired.

## Considered Approaches

### 1. Launch-closure vertical slice — selected

Add infrastructure state, safe fallback, real backend journey tests, migration verification, and operations documentation as one bounded release gate. This provides the strongest evidence that the existing feature is deployable and preserves the current architecture.

### 2. Observability-first expansion

Add broad metrics, distributed tracing, and a general logging platform before closing the messaging journey. This could be useful later, but it would introduce a larger cross-cutting system while leaving the current feature without end-to-end launch proof.

### 3. Messaging feature expansion

Proceed directly to blocking, reporting, or moderation. This would enlarge the product and data model before the durability, degradation, and migration gates are closed.

## Architecture

### Source of truth and command boundary

PostgreSQL is the only durable source of truth. All message sends and read-cursor advances continue to use authenticated HTTP commands. Socket.IO accepts authenticated connections and publishes committed events only; it never accepts a client command that writes a message or selects an arbitrary user room.

The send flow remains:

1. Authenticate the user and load the conversation membership.
2. Validate the message and check idempotency.
3. Consume the distributed or local per-user/per-conversation rate limit.
4. Lock the match and commit the message plus conversation activity timestamp in PostgreSQL.
5. Return the committed message.
6. Publish authorized events to both participant user rooms on a best-effort basis.

A publication failure after step 4 cannot change the HTTP result or roll back the message. A client recovers from any missed event by listing conversations and fetching message history over HTTP.

### Messaging infrastructure state

Add one application-scoped messaging infrastructure status service. It owns no network connections and stores only sanitized component state. The Socket.IO adapter factory and message rate-limit store report transitions to it.

The service tracks two components:

- `realtime`: `single-instance`, `distributed`, or `local-fallback`;
- `messageRateLimit`: `single-instance`, `distributed`, or `local-fallback`.

Each component also records a sanitized reason category and transition time when degraded. It never stores the thrown error object, connection URL, token, message body, or user email.

Mode semantics are explicit:

- `single-instance`: Valkey was not configured; the supported local implementation is operating normally.
- `distributed`: the configured Valkey-backed implementation is operating normally.
- `local-fallback`: Valkey was configured but is currently unavailable, so the process-local implementation is preserving availability with reduced cross-instance guarantees.

### Valkey-safe rate limiting

Wrap the existing distributed limiter with a resilient coordinator that also owns a bounded local limiter. When no Valkey URL is configured, it uses the local limiter directly. When Valkey is configured, it prefers the distributed limiter.

If connection, evaluation, timeout, or malformed-response failure prevents the distributed limiter from making a decision, the coordinator:

1. records `messageRateLimit: local-fallback` with a sanitized reason;
2. evaluates the same request against the local limiter;
3. schedules the next distributed probe after a bounded cooldown instead of reconnecting on every message.

After a successful probe and distributed decision, status returns to `distributed`. A genuine distributed `429` is a valid decision, not an infrastructure failure, and is returned without falling back. The fallback never becomes unlimited: it retains the existing 20-message/60-second user-and-conversation bound per API process.

### Socket.IO adapter behavior

When Valkey is absent, the default in-memory Socket.IO adapter operates in `single-instance` mode. When Valkey is configured and both pub/sub clients connect, status is `distributed`. If adapter creation fails or times out, the clients are safely closed, the default in-memory adapter remains active, and status becomes `local-fallback`.

Runtime adapter errors cannot silently claim distributed health. The adapter reports a sanitized degraded transition. Realtime publication remains best effort and HTTP recovery remains authoritative. Re-establishing a failed Socket.IO adapter at runtime is not required in this iteration; normal process restart may restore distributed fan-out. This is different from the message rate limiter, which may probe and recover without replacing the application adapter.

## Health Contract

`GET /api/v1/health` remains a dependency-free liveness check:

```json
{
  "status": "ok"
}
```

`GET /api/v1/ready` requires a successful PostgreSQL query. A database failure returns HTTP `503` with database status `error`. Messaging infrastructure degradation does not make the durable API unready, so a healthy database returns HTTP `200` with an overall `ok` or `degraded` status.

Representative single-instance response:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "realtime": { "status": "ok", "mode": "single-instance" },
    "messageRateLimit": { "status": "ok", "mode": "single-instance" }
  }
}
```

Representative fallback response:

```json
{
  "status": "degraded",
  "checks": {
    "database": "ok",
    "realtime": { "status": "degraded", "mode": "local-fallback", "reason": "connection" },
    "messageRateLimit": { "status": "degraded", "mode": "local-fallback", "reason": "timeout" }
  }
}
```

Allowed public reason categories are `connection`, `timeout`, `protocol`, and `runtime`. Responses contain no raw error messages or configuration values.

## Error Handling And Logging

- Database transaction failure: do not emit; preserve the existing stable HTTP error boundary and omit database detail.
- Socket publication failure after commit: return the committed message, mark realtime degraded when applicable, and log one sanitized warning.
- Valkey limiter infrastructure failure: apply the bounded local fallback; do not turn the durable send into a Valkey-originated `5xx`.
- Distributed rate-limit rejection: return the existing `429` and retry-after value; do not treat it as degradation.
- Duplicate `clientMessageId`: return the original logical message without consuming another limit or publishing a duplicate.
- Match close/send race: retain the PostgreSQL row lock and reject a send that loses to match closure.
- Shutdown: settle or destroy Valkey clients without hanging process termination.

Operational warnings use the Nest logger and contain only component name, sanitized reason category, operating mode, request ID when a request exists, and stable internal entity IDs when needed. They never include bearer tokens, JWT payloads, verification codes, message text, email addresses, Valkey URLs, database URLs, or raw thrown-error text.

## Verification Design

### Always-on unit and service tests

- messaging infrastructure state defaults and transitions;
- public health serialization and absence of sensitive details;
- local mode when Valkey is unconfigured;
- fallback on distributed connection, evaluation, timeout, and protocol failures;
- cooldown prevents a reconnect attempt per message;
- a genuine distributed `429` remains authoritative;
- successful recovery returns the rate limiter to distributed mode;
- Socket.IO adapter creation reports single-instance, distributed, and fallback modes;
- duplicate send remains idempotent and does not publish twice;
- existing HTTP authorization, pagination, read cursor, close/send locking, auth, and listing-flow tests remain green.

### PostgreSQL 16 integration journey

Use the existing disposable PostgreSQL helper and apply production migrations. Start a real Nest HTTP and Socket.IO application on an ephemeral port. Use three authenticated users with owned roommate profiles.

The journey proves:

1. Opposite-direction likes create one normalized match, one conversation, and two members.
2. A disconnected recipient misses no durable data: the sender posts through HTTP and the recipient later fetches one unread message.
3. A real authenticated Socket.IO client joins through the public namespace.
4. A second HTTP send produces exactly one logical committed-message event for both connected participants.
5. The recipient advances the read cursor over HTTP and the sender receives the read event.
6. Reconnect plus HTTP synchronization returns no missing or duplicate message.
7. A third user receives the same not-found shape for a real inaccessible conversation and a missing conversation.
8. Retrying a `clientMessageId` returns the original message and emits no duplicate event.

The test does not insert application messages directly through Prisma. Database setup may create users and owned profiles, but matching, send, list, and read behavior pass through authenticated public HTTP endpoints.

### Migration safety

Run migrations against:

- an empty PostgreSQL 16 database;
- a database at the pre-roommate-messaging migration state containing ownerless development `RoommateProfile` rows.

The second path proves that the additive owner relation, match, conversation, member, message, and read-cursor changes preserve existing rows and do not require a fabricated user owner.

### Opt-in real Valkey smoke

When `RUN_VALKEY_SMOKE=1` and `VALKEY_URL` are provided, start two API instances attached to the same PostgreSQL database and Valkey service. Connect one participant to each instance, send through one instance, and prove the peer receives the event through the other. Then verify safe client shutdown. Failure injection for fallback remains deterministic in always-on tests rather than depending on an unstable external outage sequence.

## Operations And Documentation

- Keep `VALKEY_URL` optional for a supported single-instance deployment.
- Document the `/roommate-messaging` Socket.IO namespace and HTTP recovery contract.
- Explain `single-instance`, `distributed`, and `local-fallback` readiness modes.
- Document the opt-in PostgreSQL and Valkey smoke commands.
- Update Docker Compose only as needed to provide an optional Valkey-backed verification path without making it a prerequisite for database-only local startup.
- Correct README scope statements that currently claim roommate direct messages and realtime updates are not wired.

## Acceptance Criteria

- All backend tests pass.
- Backend type checking and production build pass.
- Prisma schema validation passes.
- PostgreSQL 16 migration tests pass for empty and existing-ownerless-profile databases when the database smoke environment is available.
- The real two-user Socket.IO and offline-recovery journey passes.
- The opt-in two-instance Valkey smoke passes when its environment is enabled.
- `/health` stays dependency-free; `/ready` returns `503` only for database-critical failure and reports messaging degradation without secrets.
- A configured but unavailable Valkey service cannot by itself reject a durable roommate message because of rate-limit infrastructure failure.
- No new frontend or chat-product functionality is introduced.
- Documentation describes the backend as implemented.
- Only backend, test, configuration, and documentation files within this scope are changed.
