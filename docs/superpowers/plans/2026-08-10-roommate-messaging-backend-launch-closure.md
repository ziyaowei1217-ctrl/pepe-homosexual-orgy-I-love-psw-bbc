# Roommate Messaging Backend Launch Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing durable roommate messaging backend launch-verifiable by adding explicit infrastructure health, bounded Valkey fallback, real PostgreSQL and Socket.IO journeys, cross-instance Valkey verification, migration safety, and accurate operations documentation.

**Architecture:** PostgreSQL and authenticated HTTP commands remain authoritative. An application-scoped status service reports whether realtime fan-out and message rate limiting are running in single-instance, distributed, or local-fallback mode; Valkey infrastructure failures fall back to bounded local behavior without rolling back committed messages. Real clients and databases verify the complete backend through public boundaries.

**Tech Stack:** NestJS 10, TypeScript 5.7, Prisma 6, PostgreSQL 16, Socket.IO 4, Valkey/Redis, Vitest 2, Supertest, pnpm 9.

## Global Constraints

- PostgreSQL remains the only durable source of truth.
- All message sends and read-cursor writes continue through authenticated HTTP routes.
- Socket.IO publishes committed events only and exposes no client write or arbitrary-room command.
- `GET /api/v1/health` remains dependency-free.
- Database readiness failure returns `503`; messaging degradation remains `200` with overall status `degraded`.
- Public degradation reasons are limited to `connection`, `timeout`, `protocol`, and `runtime`.
- Logs and health output must never contain tokens, JWT payloads, verification codes, message bodies, email addresses, Valkey URLs, database URLs, or raw thrown-error text.
- A genuine distributed `429` remains authoritative and must not trigger local fallback.
- Local fallback retains the existing 20-message/60-second per-user/per-conversation limit per process.
- `VALKEY_URL` remains optional for supported single-instance operation.
- No frontend changes and no new chat-product features.
- Do not stage or modify unrelated `outputs/`, presentation, chart, temporary, or user-owned files.

---

## File Structure

### Backend health and resilience

- Create `api/src/health/messaging-infrastructure-health.ts`: sanitized in-memory state for realtime and message-rate-limit modes.
- Modify `api/src/health/health.module.ts`: provide and export the state service.
- Modify `api/src/health/health.service.ts`: combine database readiness with sanitized messaging status.
- Modify `api/src/roommate-conversations/roommate-message-rate-limit.ts`: add timeouts, fallback coordination, recovery cooldown, and sanitized warnings.
- Modify `api/src/roommate-conversations/roommate-conversations.module.ts`: inject configuration and shared status into the limiter factory.
- Modify `api/src/roommate-conversations/socket-adapter.ts`: report single-instance, distributed, and fallback transitions.
- Modify `api/src/main.ts`: pass the shared status reporter into Socket.IO adapter setup.

### Verification and operations

- Create `api/test/messaging-infrastructure-health.spec.ts`: state and readiness contract tests.
- Modify `api/test/health.controller.spec.ts`: liveness, healthy readiness, degraded readiness, and database-failure assertions.
- Modify `api/test/roommate-message-rate-limit.spec.ts`: timeout, fallback, cooldown, `429`, recovery, teardown, and redaction tests.
- Modify `api/test/socket-adapter.spec.ts`: adapter mode and redaction tests.
- Create `api/test/roommate-realtime-smoke.spec.ts`: real PostgreSQL, HTTP, and Socket.IO three-user journey.
- Create `api/test/roommate-messaging-migration-safety.spec.ts`: empty and pre-messaging ownerless-row migration paths.
- Create `api/test/roommate-valkey-realtime-smoke.spec.ts`: opt-in two-instance cross-node event delivery.
- Modify `api/package.json` and `pnpm-lock.yaml`: add the Socket.IO test client and explicit smoke scripts.
- Modify `api/.env.example`, `docker-compose.yml`, and `README.md`: document optional Valkey, health modes, namespace, recovery, and verification.

---

### Task 1: Add Sanitized Messaging Infrastructure Health

**Files:**
- Create: `api/src/health/messaging-infrastructure-health.ts`
- Modify: `api/src/health/health.module.ts`
- Modify: `api/src/health/health.service.ts`
- Test: `api/test/messaging-infrastructure-health.spec.ts`
- Test: `api/test/health.controller.spec.ts`

**Interfaces:**
- Produces: `MessagingInfrastructureHealth.markSingleInstance(component)`.
- Produces: `MessagingInfrastructureHealth.markDistributed(component)`.
- Produces: `MessagingInfrastructureHealth.markLocalFallback(component, reason)`.
- Produces: `MessagingInfrastructureHealth.snapshot()` returning both component states.
- Produces: public modes `single-instance | distributed | local-fallback` and reasons `connection | timeout | protocol | runtime`.

- [ ] **Step 1: Write failing state-service tests**

Create `api/test/messaging-infrastructure-health.spec.ts` with exact default and transition expectations:

```ts
import { describe, expect, it } from "vitest";

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";

describe("MessagingInfrastructureHealth", () => {
  it("defaults both components to healthy single-instance operation", () => {
    const health = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));

    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "single-instance" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("reports only sanitized fallback reasons and clears them on recovery", () => {
    const health = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));

    health.markLocalFallback("realtime", "connection");
    expect(health.snapshot().realtime).toEqual({
      status: "degraded",
      mode: "local-fallback",
      reason: "connection",
      changedAt: "2026-08-10T00:00:00.000Z"
    });

    health.markDistributed("realtime");
    expect(health.snapshot().realtime).toEqual({ status: "ok", mode: "distributed" });
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --dir api vitest run test/messaging-infrastructure-health.spec.ts`

Expected: FAIL because `messaging-infrastructure-health.ts` does not exist.

- [ ] **Step 3: Implement the focused state service**

Create these exact public types and methods in `api/src/health/messaging-infrastructure-health.ts`:

```ts
import { Injectable } from "@nestjs/common";

export type MessagingInfrastructureComponent = "realtime" | "messageRateLimit";
export type MessagingInfrastructureMode = "single-instance" | "distributed" | "local-fallback";
export type MessagingInfrastructureReason = "connection" | "timeout" | "protocol" | "runtime";

type HealthyComponent = { status: "ok"; mode: Exclude<MessagingInfrastructureMode, "local-fallback"> };
type DegradedComponent = {
  status: "degraded";
  mode: "local-fallback";
  reason: MessagingInfrastructureReason;
  changedAt: string;
};
export type MessagingInfrastructureComponentHealth = HealthyComponent | DegradedComponent;

@Injectable()
export class MessagingInfrastructureHealth {
  private readonly state: Record<MessagingInfrastructureComponent, MessagingInfrastructureComponentHealth> = {
    realtime: { status: "ok", mode: "single-instance" },
    messageRateLimit: { status: "ok", mode: "single-instance" }
  };

  constructor(private readonly now: () => Date = () => new Date()) {}

  markSingleInstance(component: MessagingInfrastructureComponent) {
    this.state[component] = { status: "ok", mode: "single-instance" };
  }

  markDistributed(component: MessagingInfrastructureComponent) {
    this.state[component] = { status: "ok", mode: "distributed" };
  }

  markLocalFallback(component: MessagingInfrastructureComponent, reason: MessagingInfrastructureReason) {
    this.state[component] = {
      status: "degraded",
      mode: "local-fallback",
      reason,
      changedAt: this.now().toISOString()
    };
  }

  snapshot() {
    return { realtime: { ...this.state.realtime }, messageRateLimit: { ...this.state.messageRateLimit } };
  }
}
```

- [ ] **Step 4: Extend health tests before changing readiness**

Update `api/test/health.controller.spec.ts` so constructors receive a real `MessagingInfrastructureHealth`. Add assertions for:

```ts
it("returns degraded readiness while the database remains available", async () => {
  const infrastructure = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));
  infrastructure.markLocalFallback("realtime", "connection");
  const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never, infrastructure);

  await expect(service.ready()).resolves.toEqual({
    status: "degraded",
    checks: {
      database: "ok",
      realtime: {
        status: "degraded",
        mode: "local-fallback",
        reason: "connection",
        changedAt: "2026-08-10T00:00:00.000Z"
      },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    }
  });
});
```

Keep the database failure assertion as `ServiceUnavailableException`, and assert its response contains only `status`, `checks.database`, and the sanitized infrastructure snapshot.

- [ ] **Step 5: Run health tests and confirm RED**

Run: `pnpm --dir api vitest run test/messaging-infrastructure-health.spec.ts test/health.controller.spec.ts`

Expected: state tests PASS; readiness tests FAIL because `HealthService` does not consume the new service.

- [ ] **Step 6: Wire the state into readiness**

Provide `MessagingInfrastructureHealth` from `HealthModule` with a factory so Nest does not attempt to inject the test clock function, then export it and inject it into `HealthService`:

```ts
providers: [
  HealthService,
  { provide: MessagingInfrastructureHealth, useFactory: () => new MessagingInfrastructureHealth() }
],
exports: [MessagingInfrastructureHealth]
```

After `SELECT 1`, return:

```ts
const messaging = this.messagingInfrastructure.snapshot();
return {
  status: Object.values(messaging).some((check) => check.status === "degraded") ? "degraded" : "ok",
  checks: { database: "ok", ...messaging }
};
```

On database failure, throw `ServiceUnavailableException` with `status: "error"`, `checks.database: "error"`, and the same sanitized snapshot. Do not include the caught error.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `pnpm --dir api vitest run test/messaging-infrastructure-health.spec.ts test/health.controller.spec.ts test/http-launch-readiness.e2e.spec.ts`

Expected: all tests PASS after updating existing exact `/ready` expectations to include healthy single-instance component objects.

- [ ] **Step 8: Commit**

```bash
git add api/src/health api/test/messaging-infrastructure-health.spec.ts api/test/health.controller.spec.ts api/test/http-launch-readiness.e2e.spec.ts
git commit -m "feat: report roommate messaging infrastructure health"
```

### Task 2: Make Message Rate Limiting Valkey-Failure Tolerant

**Files:**
- Modify: `api/src/roommate-conversations/roommate-message-rate-limit.ts`
- Modify: `api/src/roommate-conversations/roommate-conversations.module.ts`
- Test: `api/test/roommate-message-rate-limit.spec.ts`

**Interfaces:**
- Consumes: `MessagingInfrastructureHealth` from Task 1.
- Produces: `ResilientRoommateMessageRateLimiter` with distributed preference, bounded local fallback, cooldown, and recovery.
- Produces: `categorizeValkeyFailure(error): MessagingInfrastructureReason`.
- Keeps: `createRoommateMessageRateLimiter(input): RoommateMessageRateLimiter` as the module factory.

- [ ] **Step 1: Write failing fallback and authority tests**

Extend `api/test/roommate-message-rate-limit.spec.ts` with deterministic fake clients and clocks covering these exact cases:

```ts
it("falls back to the bounded local limiter when Valkey connect fails");
it("falls back when Valkey evaluation times out or returns a malformed protocol response");
it("does not attempt another Valkey operation before the recovery cooldown expires");
it("returns a genuine distributed 429 without consuming local fallback capacity");
it("marks the limiter distributed again after a successful recovery probe");
it("logs only component, mode, and sanitized reason when Valkey fails");
```

The redaction test must use an error string containing all prohibited categories and prove none appear:

```ts
const leaked = "victim@example.com token=secret body={private} redis://user:pass@host:6379";
expect(JSON.stringify(warnings)).not.toContain("victim@example.com");
expect(JSON.stringify(warnings)).not.toContain("secret");
expect(JSON.stringify(warnings)).not.toContain("private");
expect(JSON.stringify(warnings)).not.toContain("redis://");
expect(JSON.stringify(warnings)).toContain('"reason":"connection"');
```

- [ ] **Step 2: Run the focused suite and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-message-rate-limit.spec.ts`

Expected: FAIL because infrastructure failures currently escape instead of using local fallback.

- [ ] **Step 3: Add bounded operation timeouts and failure classification**

In `roommate-message-rate-limit.ts`, reuse one `settleWithin(operation, timeoutMs)` helper for both `connect()` and `eval()`. Add:

```ts
class ValkeyOperationTimeoutError extends Error {}
class ValkeyProtocolError extends Error {}

async function settleWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new ValkeyOperationTimeoutError()), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function categorizeValkeyFailure(error: unknown): MessagingInfrastructureReason {
  if (error instanceof ValkeyOperationTimeoutError) return "timeout";
  if (error instanceof ValkeyProtocolError) return "protocol";
  if (error instanceof Error && /connect|socket|closed|ECONN/i.test(error.name + " " + error.message)) {
    return "connection";
  }
  return "runtime";
}
```

Convert a non-array or short `EVAL` response into `ValkeyProtocolError`. Keep `HttpException` status `429` distinguishable from infrastructure errors.

- [ ] **Step 4: Implement the resilient coordinator**

Add `ResilientRoommateMessageRateLimiter` with these constructor inputs and behavior:

```ts
type ResilientLimiterOptions = {
  distributed: RoommateMessageRateLimiter;
  local: LocalRoommateMessageRateLimiter;
  health: MessagingInfrastructureHealth;
  now?: () => number;
  retryCooldownMs?: number;
  logger?: { warn(message: Record<string, string>): unknown };
};

export class ResilientRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private nextDistributedProbeAt = 0;
  private readonly distributed: RoommateMessageRateLimiter;
  private readonly local: LocalRoommateMessageRateLimiter;
  private readonly health: MessagingInfrastructureHealth;
  private readonly now: () => number;
  private readonly retryCooldownMs: number;
  private readonly logger: { warn(message: Record<string, string>): unknown };

  constructor(options: ResilientLimiterOptions) {
    super();
    this.distributed = options.distributed;
    this.local = options.local;
    this.health = options.health;
    this.now = options.now ?? Date.now;
    this.retryCooldownMs = options.retryCooldownMs ?? 30_000;
    this.logger = options.logger ?? new Logger("RoommateMessageRateLimiter");
  }

  async consume(request: RoommateMessageRateLimitRequest): Promise<void> {
    const now = this.now();
    if (now < this.nextDistributedProbeAt) return this.local.consume(request);

    try {
      await this.distributed.consume(request);
      this.health.markDistributed("messageRateLimit");
    } catch (error) {
      if (isRateLimitExceeded(error)) throw error;
      const reason = categorizeValkeyFailure(error);
      this.nextDistributedProbeAt = now + this.retryCooldownMs;
      this.health.markLocalFallback("messageRateLimit", reason);
      this.logger.warn({ component: "messageRateLimit", mode: "local-fallback", reason });
      await this.local.consume(request);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const destroy = (this.distributed as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy;
    if (destroy) await destroy.call(this.distributed);
  }
}

function isRateLimitExceeded(error: unknown): error is HttpException {
  return error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
}
```

Import `Logger` with the existing Nest exceptions. Use a default operation timeout of 1,000 ms and recovery cooldown of 30,000 ms. Delegate `onModuleDestroy()` to the distributed limiter when available.

- [ ] **Step 5: Update the factory and Nest provider**

Extend `createRoommateMessageRateLimiter` input with `health`, `now`, `operationTimeoutMs`, `retryCooldownMs`, and sanitized `logger`. Behavior:

- no `VALKEY_URL`: mark `single-instance` and return `LocalRoommateMessageRateLimiter`;
- configured `VALKEY_URL`: construct the Valkey limiter, optimistically mark `distributed`, and return `ResilientRoommateMessageRateLimiter` with a separate local limiter;
- never log the URL or caught error.

Import `HealthModule` in `RoommateConversationsModule` and change the provider to inject `ConfigService` and `MessagingInfrastructureHealth`:

```ts
{
  provide: RoommateMessageRateLimiter,
  inject: [ConfigService, MessagingInfrastructureHealth],
  useFactory: (config: ConfigService, health: MessagingInfrastructureHealth) =>
    createRoommateMessageRateLimiter({ valkeyUrl: config.get<string>("VALKEY_URL"), health })
}
```

- [ ] **Step 6: Run focused and send-regression tests**

Run: `pnpm --dir api vitest run test/roommate-message-rate-limit.spec.ts test/roommate-conversations.service.spec.ts test/roommate-conversations.e2e.spec.ts`

Expected: all tests PASS; a Valkey infrastructure failure no longer rejects the durable send path.

- [ ] **Step 7: Commit**

```bash
git add api/src/roommate-conversations/roommate-message-rate-limit.ts api/src/roommate-conversations/roommate-conversations.module.ts api/test/roommate-message-rate-limit.spec.ts
git commit -m "fix: preserve roommate sends during Valkey outages"
```

### Task 3: Report Socket.IO Distribution Health Safely

**Files:**
- Modify: `api/src/roommate-conversations/socket-adapter.ts`
- Modify: `api/src/main.ts`
- Test: `api/test/socket-adapter.spec.ts`

**Interfaces:**
- Consumes: `MessagingInfrastructureHealth` from Task 1.
- Keeps: `createRoommateSocketAdapter(app, options): Promise<RoommateSocketIoAdapter | undefined>`.
- Adds: `options.health?: MessagingInfrastructureHealth`.
- Adds: runtime error reporting with sanitized reason categories.

- [ ] **Step 1: Write failing mode and redaction tests**

Extend `api/test/socket-adapter.spec.ts` with:

```ts
it("marks realtime single-instance when VALKEY_URL is absent");
it("marks realtime distributed after both adapter clients connect");
it("marks realtime local-fallback when adapter connection times out");
it("marks realtime local-fallback on a runtime pub/sub client error");
it("does not include the raw client error or Valkey URL in warnings");
```

Use the Task 1 service and assert the exact snapshot after each transition. Capture logger calls and seed raw failures with token, email, message-body, and URL text.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --dir api vitest run test/socket-adapter.spec.ts`

Expected: FAIL because the adapter currently has no health reporter.

- [ ] **Step 3: Report adapter lifecycle state**

Extend `SocketAdapterOptions` with `health`. Apply these transitions:

```ts
if (!valkeyUrl) {
  options.health?.markSingleInstance("realtime");
  return undefined;
}
```

After both clients connect, call `markDistributed("realtime")`. On connection rejection or timeout, call `markLocalFallback("realtime", categorizeValkeyFailure(error))`, close both clients, and emit only:

```ts
logger.warn({ component: "realtime", mode: "local-fallback", reason });
```

Client `error` listeners call `markLocalFallback("realtime", "runtime")` and the same sanitized warning. They do not attach the error object.

- [ ] **Step 4: Pass the shared reporter from bootstrap**

In `main.ts`, retrieve the Task 1 singleton and pass it to the adapter:

```ts
const messagingInfrastructure = app.get(MessagingInfrastructureHealth);
const socketAdapter = await createRoommateSocketAdapter(app, {
  valkeyUrl: config.get<string>("VALKEY_URL"),
  health: messagingInfrastructure
});
```

- [ ] **Step 5: Run adapter, health, and gateway regression tests**

Run: `pnpm --dir api vitest run test/socket-adapter.spec.ts test/messaging-infrastructure-health.spec.ts test/health.controller.spec.ts test/roommate-conversations.gateway.spec.ts`

Expected: all tests PASS; no client-supplied room behavior is introduced.

- [ ] **Step 6: Commit**

```bash
git add api/src/roommate-conversations/socket-adapter.ts api/src/main.ts api/test/socket-adapter.spec.ts
git commit -m "feat: expose roommate realtime degradation"
```

### Task 4: Add Real PostgreSQL And Socket.IO Launch Verification

**Files:**
- Modify: `api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `api/test/roommate-realtime-smoke.spec.ts`
- Create: `api/test/roommate-messaging-migration-safety.spec.ts`
- Reuse: `api/test/support/disposable-postgres.ts`

**Interfaces:**
- Consumes: public roommate action, conversation list, message send/list, and read endpoints.
- Consumes: Socket.IO namespace `/roommate-messaging` with handshake `auth.token`.
- Produces: `launch:smoke:roommate` script for PostgreSQL-backed messaging verification.

- [ ] **Step 1: Add the Socket.IO test client**

Run: `pnpm --filter sublet-pipeline-api add -D socket.io-client@4.8.3`

Expected: `api/package.json` and `pnpm-lock.yaml` contain the client version aligned with the server.

- [ ] **Step 2: Write the failing real backend journey**

Create `api/test/roommate-realtime-smoke.spec.ts` behind `RUN_DB_SMOKE=1`. Use `createDisposablePostgres("roommate_realtime")`, deploy migrations, set `DATABASE_URL`, start `AppModule` with `app.listen(0)`, and create three users plus two owned public roommate profiles through Prisma setup.

Use public routes for all behavior:

```ts
const firstLike = await http
  .post(`/api/v1/roommates/${profileB.id}/actions`)
  .auth(tokenA, { type: "bearer" })
  .send({ action: "LIKE" })
  .expect(201);
expect(firstLike.body.conversation).toBeNull();

const reciprocal = await http
  .post(`/api/v1/roommates/${profileA.id}/actions`)
  .auth(tokenB, { type: "bearer" })
  .send({ action: "LIKE" })
  .expect(201);
const conversationId = reciprocal.body.conversation.id;
```

Then assert, in order:

- user A sends `offline-client-message` while user B has no socket;
- user B lists one unread message and fetches that exact body over HTTP;
- real Socket.IO clients for A and B connect to `${baseUrl}/roommate-messaging` with `auth.token`;
- user A sends `realtime-client-message` over HTTP and each socket receives one `roommate.message.created` event with the same committed message ID;
- retrying the same client ID returns the same message ID and produces no second logical event;
- user B marks the committed message read over HTTP and user A receives `roommate.message.read`;
- reconnecting user B and refetching history yields two unique message IDs;
- user C receives the same `404` body for the real inaccessible conversation and `missing-conversation`.

Use a bounded event helper so failure completes rather than hanging:

```ts
function onceEvent<T>(socket: Socket, event: string, timeoutMs = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
```

Close both sockets, the Nest app, Prisma, and the disposable database in `afterAll`, even after assertion failure.

- [ ] **Step 3: Run the journey and confirm RED**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api vitest run test/roommate-realtime-smoke.spec.ts
```

Expected: FAIL until the real client setup and exact response/event assumptions are aligned with the current backend.

- [ ] **Step 4: Mirror production bootstrap in the smoke application**

Configure the test application with the `api/v1` global prefix, the production `ValidationPipe` options, configured CORS, and the default in-memory Socket.IO adapter. Delete `process.env.VALKEY_URL` before module compilation so this smoke proves the supported single-instance path. Do not add a test-only message method, bypass authorization, or write application messages through Prisma.

- [ ] **Step 5: Write the failing pre-messaging migration safety test**

Create `api/test/roommate-messaging-migration-safety.spec.ts` behind `RUN_DB_SMOKE=1`. Create two disposable PostgreSQL 16 databases:

1. Empty path: run `prisma migrate deploy`, then assert the current migration set succeeds.
2. Existing-row path: apply every `api/prisma/migrations/*/migration.sql` file with a directory name lexically before `20260809090000_roommate_realtime_messaging`; insert an ownerless `RoommateProfile`; apply that migration and every later migration SQL file; assert the row still exists with `ownerId IS NULL` and all conversation tables and read-cursor columns exist.

Use a concrete sorted selector:

```ts
const migrations = readdirSync(migrationsDirectory)
  .filter((name) => existsSync(join(migrationsDirectory, name, "migration.sql")))
  .sort();
const splitAt = migrations.indexOf("20260809090000_roommate_realtime_messaging");
expect(splitAt).toBeGreaterThan(0);
```

Feed each SQL file to `psql -v ON_ERROR_STOP=1` through the disposable PostgreSQL container. Do not modify migration files.

- [ ] **Step 6: Run both database tests and confirm GREEN**

Run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api vitest run test/roommate-realtime-smoke.spec.ts test/roommate-messaging-migration-safety.spec.ts
```

Expected: both tests PASS on PostgreSQL 16.

- [ ] **Step 7: Add the explicit smoke script**

Add to `api/package.json`:

```json
"launch:smoke:roommate": "node -e \"if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required for launch:smoke:roommate'); process.exit(1) }\" && RUN_DB_SMOKE=1 vitest run test/roommate-realtime-smoke.spec.ts test/roommate-messaging-migration-safety.spec.ts"
```

- [ ] **Step 8: Run API regression checks**

Run: `pnpm --dir api vitest run test/roommate-realtime-smoke.spec.ts test/roommate-messaging-migration-safety.spec.ts test/roommate-conversations.e2e.spec.ts test/roommate-conversations.gateway.spec.ts`

Expected: always-on tests PASS; database smoke files SKIP cleanly without `RUN_DB_SMOKE=1`.

- [ ] **Step 9: Commit**

```bash
git add api/package.json pnpm-lock.yaml api/test/roommate-realtime-smoke.spec.ts api/test/roommate-messaging-migration-safety.spec.ts
git commit -m "test: verify durable roommate realtime journey"
```

### Task 5: Prove Cross-Instance Delivery With Real Valkey

**Files:**
- Create: `api/test/roommate-valkey-realtime-smoke.spec.ts`
- Modify: `api/package.json`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `createRoommateSocketAdapter(app, { valkeyUrl, health })` from Task 3.
- Consumes: `socket.io-client` from Task 4.
- Produces: opt-in `launch:smoke:valkey` coverage for rate-limit Lua behavior and cross-instance Socket.IO fan-out.

- [ ] **Step 1: Add an optional Valkey Compose service**

Add this service without making `api` depend on it:

```yaml
  valkey:
    image: valkey/valkey:8-alpine
    container_name: sublet-pipeline-valkey
    profiles: ["realtime"]
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "valkey-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 12
    networks:
      - sublet_pipeline
```

Default `docker compose up` remains database-only for API messaging infrastructure. The optional service starts with `docker compose --profile realtime up -d valkey`.

- [ ] **Step 2: Write the failing two-instance smoke**

Create `api/test/roommate-valkey-realtime-smoke.spec.ts`, gated by both `RUN_VALKEY_SMOKE=1` and `RUN_DB_SMOKE=1`. Create one disposable migrated database and two independent Nest applications using `AppModule`. For each app:

```ts
const health = app.get(MessagingInfrastructureHealth);
const adapter = await createRoommateSocketAdapter(app, { valkeyUrl: process.env.VALKEY_URL, health });
expect(adapter).toBeDefined();
app.useWebSocketAdapter(adapter!);
await app.listen(0);
```

Create a mutual conversation through instance A. Connect user A's socket to instance A and user B's socket to instance B. Send a message through instance A's HTTP endpoint and assert user B receives exactly one `roommate.message.created` event through instance B with the committed message ID. Assert both `/ready` responses report `realtime.mode === "distributed"`. Dispose both adapters and applications in `afterAll`.

- [ ] **Step 3: Run the smoke and confirm RED**

Run:

```bash
RUN_DB_SMOKE=1 RUN_VALKEY_SMOKE=1 \
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' \
VALKEY_URL='redis://127.0.0.1:6379' \
pnpm --dir api vitest run test/roommate-valkey-realtime-smoke.spec.ts
```

Expected: FAIL until both applications are fully wired to real adapters and the shared-user-room event crosses instances.

- [ ] **Step 4: Make the smoke deterministic without production shortcuts**

Use unique user/profile/client IDs per run and wait for both socket `connect` events before sending. Define the bounded event helper locally so the smoke cannot hang:

```ts
function onceEvent<T>(socket: Socket, event: string, timeoutMs = 2_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
```

Database setup may create users/profiles, but likes and message sends use HTTP. Do not expose adapter internals or add a production-only test event.

- [ ] **Step 5: Extend the Valkey smoke script**

Replace `api/package.json`'s current `launch:smoke:valkey` script with:

```json
"launch:smoke:valkey": "node -e \"if (!process.env.VALKEY_URL || !process.env.DATABASE_URL) { console.error('VALKEY_URL and DATABASE_URL are required for launch:smoke:valkey'); process.exit(1) }\" && RUN_DB_SMOKE=1 RUN_VALKEY_SMOKE=1 vitest run test/valkey-rate-limit.integration.spec.ts test/roommate-valkey-realtime-smoke.spec.ts"
```

- [ ] **Step 6: Run real Valkey verification and regular adapter tests**

Run the command from Step 3, then run:

`pnpm --dir api vitest run test/socket-adapter.spec.ts test/roommate-conversations.gateway.spec.ts test/valkey-rate-limit.integration.spec.ts`

Expected: the real smoke PASSes; always-on adapter/gateway tests PASS; the existing Valkey integration test SKIPs without its opt-in flag.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml api/package.json api/test/roommate-valkey-realtime-smoke.spec.ts
git commit -m "test: prove cross-instance roommate realtime delivery"
```

### Task 6: Update Operations Documentation And Run The Release Gate

**Files:**
- Modify: `api/.env.example`
- Modify: `README.md`
- Review: every file changed in Tasks 1–5

**Interfaces:**
- Consumes: health modes and smoke scripts from Tasks 1–5.
- Produces: accurate local, degraded, and distributed operating instructions.

- [ ] **Step 1: Update environment and configuration documentation**

In `api/.env.example`, keep `VALKEY_URL=""` and add comments stating:

- empty means supported single-instance Socket.IO and local rate limiting;
- configured means distributed Socket.IO fan-out and rate limiting;
- never place credentials in logs or health output.

Do not add a default production credential or make Valkey required.

- [ ] **Step 2: Correct README product scope and backend operation**

Update README to state that authenticated roommate direct messages, durable history, unread counts, read cursors, and realtime events are wired in the backend. Explicitly retain these limitations: no email/Web Push offline notification, attachment, group chat, typing indicator, edit, recall, or presence claim.

Document:

- HTTP collection: `/api/v1/roommate-conversations`;
- Socket.IO namespace: `/roommate-messaging`;
- HTTP is the reconnect/offline recovery path;
- `/health` versus `/ready` semantics;
- `single-instance`, `distributed`, and `local-fallback` modes;
- `pnpm --dir api launch:smoke:roommate`;
- optional `docker compose --profile realtime up -d valkey` and `pnpm --dir api launch:smoke:valkey`.

- [ ] **Step 3: Run the always-on backend verification matrix**

Run:

```bash
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

Expected: every command exits `0`; database- and Valkey-gated suites report skipped when flags are absent.

- [ ] **Step 4: Run the real PostgreSQL 16 gate**

With the PostgreSQL 16 Compose service available, run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api launch:smoke
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api launch:smoke:roommate
```

Expected: the existing launch smoke and new roommate smoke/migration suites PASS.

- [ ] **Step 5: Run the optional distributed gate**

With the optional Valkey service available, run:

```bash
RUN_DB_SMOKE=1 RUN_VALKEY_SMOKE=1 \
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' \
VALKEY_URL='redis://127.0.0.1:6379' \
pnpm --dir api launch:smoke:valkey
```

Expected: the Lua limiter integration and two-instance Socket.IO delivery PASS.

- [ ] **Step 6: Review authorization, redaction, and scope**

Run:

```bash
git diff --check HEAD~5..HEAD
git status --short
rg -n "token|body|email|VALKEY_URL|DATABASE_URL" api/src/health api/src/roommate-conversations
```

Manually confirm every conversation query/write begins from authenticated membership, socket rooms are server-derived, warnings use fixed sanitized fields, health output contains no raw error/configuration value, and no frontend or unrelated output file is staged.

- [ ] **Step 7: Commit documentation and any release-gate fixes**

```bash
git add api/.env.example README.md
git commit -m "docs: close roommate messaging backend launch gate"
```

If verification required code or test fixes, stage only the exact scoped files changed by those fixes and include them in this commit. Do not stage an entire directory and do not create an empty commit.
