# Roommate Realtime Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace local/disabled roommate DMs with durable, authenticated, one-to-one text chat for mutually matched real users, including realtime Socket.IO events, unread counts, read receipts, and reconnect synchronization.

**Architecture:** PostgreSQL is the source of truth. Real discovery profiles bind to `User`; reciprocal `LIKE` actions transactionally create one normalized match and conversation. HTTP endpoints perform idempotent writes and cursor reads, while a Socket.IO gateway authenticates JWTs and publishes committed events to user-scoped rooms. The Next.js client merges REST snapshots and realtime events by stable IDs.

**Tech Stack:** Next.js 15, React 19, TypeScript, NestJS 10, Prisma 6, PostgreSQL 16, Socket.IO, optional Valkey/Redis adapter, Vitest, Supertest.

## Global Constraints

- Only two real users with reciprocal `LIKE` actions may receive a writable conversation.
- Production discovery excludes ownerless demo profiles; development may still render them, but they never create real chat.
- Text only, trimmed, non-empty, maximum 2,000 characters.
- No email, Web Push, attachments, group chat, typing indicator, edit, recall, or presence indicator.
- Persist before publish; a realtime publish failure must not roll back a committed message.
- HTTP remains the synchronization and recovery path.
- All inaccessible conversation/message IDs return the same not-found shape to prevent probing.
- Preserve existing listing `DealThread` messaging and group-tour behavior.
- Do not stage or modify unrelated `outputs/`, presentation, chart, temporary, or user-owned files.

---

## File Structure

### Backend domain

- Create `api/src/roommate-conversations/dto.ts`: validated send/read/history inputs.
- Create `api/src/roommate-conversations/roommate-conversations.service.ts`: match authorization, summaries, pagination, idempotent sends, read cursors.
- Create `api/src/roommate-conversations/roommate-conversations.controller.ts`: authenticated HTTP routes.
- Create `api/src/roommate-conversations/roommate-conversation-events.ts`: transport-neutral committed-event publisher contract.
- Create `api/src/roommate-conversations/roommate-message-rate-limit.ts`: bounded per-user/per-conversation send limiting.
- Create `api/src/roommate-conversations/roommate-conversations.gateway.ts`: JWT-authenticated Socket.IO connections and user-room emission.
- Create `api/src/roommate-conversations/roommate-conversations.module.ts`: module wiring.
- Modify `api/src/roommates/roommates.service.ts`: real-profile filtering and reciprocal match creation.
- Modify `api/src/roommates/roommates.module.ts`: import/export the conversation boundary used during match creation.
- Modify `api/src/auth/auth.guard.ts`: extract reusable token-to-user authentication without weakening HTTP behavior.
- Modify `api/src/app.module.ts`, `api/src/main.ts`, and `api/src/config/cors.ts`: module and WebSocket origin wiring.
- Modify `api/prisma/schema.prisma` and create `api/prisma/migrations/20260809090000_roommate_realtime_messaging/migration.sql`: additive real-profile, match, conversation, member, and message data.

### Frontend domain

- Create `lib/roommate-conversations.ts`: immutable merge, optimistic reconciliation, unread, read-report, and cursor helpers.
- Create `lib/roommate-realtime.ts`: Socket.IO lifecycle and typed event adapter.
- Modify `lib/api.ts`: conversation/message/read contracts and API functions.
- Modify `lib/message-inbox.ts`: merge listing and roommate contacts without losing route selection.
- Modify `components/sublet-app.tsx`: load/synchronize conversations, connect realtime, send/retry/read, enable roommate DM routes.
- Modify the focused Messages screen components in `components/sublet-app.tsx`: render roommate thread state while preserving listing controls.

### Tests and operations

- Create `api/test/roommate-matches.service.spec.ts`.
- Create `api/test/roommate-conversations.service.spec.ts`.
- Create `api/test/roommate-conversations.e2e.spec.ts`.
- Create `api/test/roommate-conversations.gateway.spec.ts`.
- Extend `api/test/support/launch-prisma-mock.ts` only where the launch suite needs the additive Prisma delegates.
- Create `tests/roommate-conversations.test.ts` and `tests/roommate-realtime.test.ts`.
- Modify `tests/message-inbox.test.ts` and create `tests/sublet-app-roommate-chat.test.ts`.
- Modify `api/.env.example`, `docker-compose.yml`, and `README.md` with optional realtime configuration and local two-user verification.

---

### Task 1: Add The Durable Roommate Messaging Schema

**Files:**
- Modify: `api/prisma/schema.prisma`
- Create: `api/prisma/migrations/20260809090000_roommate_realtime_messaging/migration.sql`
- Create: `api/test/roommate-messaging-schema.spec.ts`

**Interfaces:**
- Produces: `RoommateProfile.ownerId`, `RoommateMatch`, `RoommateConversation`, `RoommateConversationMember`, and `RoommateMessage` Prisma delegates.
- Produces: unique pair `(firstUserId, secondUserId)`, unique conversation `matchId`, unique message `(senderId, clientMessageId)`.

- [ ] **Step 1: Write a failing schema contract test**

```ts
it("defines a real-owner match and durable conversation graph", () => {
  const schema = readFileSync(new URL("../prisma/schema.prisma", import.meta.url), "utf8");
  expect(schema).toContain("ownerId             String?  @unique");
  expect(schema).toContain("model RoommateMatch {");
  expect(schema).toContain("@@unique([firstUserId, secondUserId])");
  expect(schema).toContain("model RoommateConversation {");
  expect(schema).toContain("matchId       String   @unique");
  expect(schema).toContain("model RoommateConversationMember {");
  expect(schema).toContain("@@unique([conversationId, userId])");
  expect(schema).toContain("model RoommateMessage {");
  expect(schema).toContain("@@unique([senderId, clientMessageId])");
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-messaging-schema.spec.ts`

Expected: FAIL because the models and fields do not exist.

- [ ] **Step 3: Add additive Prisma models and relations**

Use these exact domain fields, plus named `User` relations and timestamps required by Prisma:

```prisma
enum RoommateMatchStatus {
  ACTIVE
  CLOSED
}

model RoommateMatch {
  id           String              @id @default(cuid())
  firstUserId  String
  secondUserId String
  status       RoommateMatchStatus @default(ACTIVE)
  matchedAt    DateTime            @default(now())
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  conversation RoommateConversation?

  @@unique([firstUserId, secondUserId])
  @@index([firstUserId, status, updatedAt])
  @@index([secondUserId, status, updatedAt])
}

model RoommateConversation {
  id            String   @id @default(cuid())
  matchId       String   @unique
  lastMessageAt DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  match         RoommateMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  members       RoommateConversationMember[]
  messages      RoommateMessage[]
}
```

Add `ownerId String? @unique` to `RoommateProfile`, two members per created conversation, and the message fields from the design. Keep every existing table and column.

- [ ] **Step 4: Write the matching additive SQL migration**

Create enums/tables/foreign keys/indexes explicitly. Do not drop, rename, truncate, or rewrite existing rows. `RoommateProfile.ownerId` starts nullable so existing development candidates migrate safely.

- [ ] **Step 5: Validate schema and migration contract**

Run: `DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate`

Run: `pnpm --dir api vitest run test/roommate-messaging-schema.spec.ts`

Expected: schema valid and focused test PASS.

- [ ] **Step 6: Commit**

```bash
git add api/prisma/schema.prisma api/prisma/migrations/20260809090000_roommate_realtime_messaging/migration.sql api/test/roommate-messaging-schema.spec.ts
git commit -m "feat: add durable roommate messaging schema"
```

### Task 2: Create Real Reciprocal Matches And Conversations

**Files:**
- Create: `api/src/roommates/roommate-match.service.ts`
- Modify: `api/src/roommates/roommates.service.ts`
- Modify: `api/src/roommates/roommates.module.ts`
- Modify: `api/src/marketplace/marketplace.service.ts`
- Modify: `api/src/marketplace/marketplace.controller.ts`
- Modify: `api/src/marketplace/dto.ts`
- Create: `api/test/roommate-matches.service.spec.ts`
- Modify: `api/test/roommates.service.spec.ts`

**Interfaces:**
- Produces: `RoommateMatchService.recordAction(actorUserId, targetProfileId, action)` returning `{ action, match, conversation }` for real profiles.
- Produces: `normalizeUserPair(leftId, rightId): { firstUserId: string; secondUserId: string }`.
- Consumes: Task 1 Prisma models.

- [ ] **Step 1: Write failing reciprocal-match tests**

Cover these exact cases:

```ts
it("creates one match and two members after the second reciprocal LIKE");
it("returns the existing conversation when the reciprocal LIKE is retried");
it("does not create a conversation for one-sided LIKE, PASS, or LATER");
it("rejects actions against the actor's own owned profile");
it("never creates real chat for an ownerless development candidate");
it("normalizes pair order during concurrent opposite-direction likes");
```

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-matches.service.spec.ts test/roommates.service.spec.ts`

Expected: FAIL because real ownership and mutual-match orchestration do not exist.

- [ ] **Step 3: Implement pair normalization and transactional match creation**

```ts
export function normalizeUserPair(leftId: string, rightId: string) {
  if (leftId === rightId) throw new BadRequestException("Cannot match with yourself");
  return leftId < rightId
    ? { firstUserId: leftId, secondUserId: rightId }
    : { firstUserId: rightId, secondUserId: leftId };
}
```

Within one Prisma transaction: upsert the action, find the actor's owned profile, check the reverse `LIKE`, upsert the normalized match, upsert its conversation, and create both member rows with `createMany({ skipDuplicates: true })`.

- [ ] **Step 4: Restrict production discovery and prevent generated real variants**

In production, query `ownerId: { not: null }`; for authenticated discovery exclude `ownerId: userId`. Only ownerless development records may use catalog expansion. Real records retain their exact action target ID.

- [ ] **Step 5: Project authenticated roommate-profile writes into an owned discovery profile**

Pass both `request.user.id` and email from `MarketplaceController`. Upsert one `RoommateProfile` by `ownerId`; derive its public card fields from the validated matching DTO and email-linked `Profile`. Never expose owner ID in the public roommate serializer.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `pnpm --dir api vitest run test/roommate-matches.service.spec.ts test/roommates.service.spec.ts test/marketplace-api.e2e.spec.ts`

Expected: all focused tests PASS and existing demo matching remains green in development.

- [ ] **Step 7: Commit**

```bash
git add api/src/roommates api/src/marketplace api/test/roommate-matches.service.spec.ts api/test/roommates.service.spec.ts api/test/marketplace-api.e2e.spec.ts
git commit -m "feat: create real reciprocal roommate matches"
```

### Task 3: Add Conversation HTTP Commands And Queries

**Files:**
- Create: `api/src/roommate-conversations/dto.ts`
- Create: `api/src/roommate-conversations/roommate-conversations.service.ts`
- Create: `api/src/roommate-conversations/roommate-conversations.controller.ts`
- Create: `api/src/roommate-conversations/roommate-conversation-events.ts`
- Create: `api/src/roommate-conversations/roommate-message-rate-limit.ts`
- Create: `api/src/roommate-conversations/roommate-conversations.module.ts`
- Modify: `api/src/app.module.ts`
- Create: `api/test/roommate-conversations.service.spec.ts`
- Create: `api/test/roommate-conversations.e2e.spec.ts`

**Interfaces:**
- Produces: `listForUser(userId)`, `listMessages(userId, conversationId, query)`, `sendMessage(userId, conversationId, dto)`, and `markRead(userId, conversationId, dto)`.
- Produces: injectable `ROOMMATE_CONVERSATION_EVENTS` with `publish(event): Promise<void>`.
- Produces: `RoommateMessageRateLimiter.consume({ userId, conversationId, now }): Promise<void>` with a 20-message/60-second window.
- Consumes: Task 1 models and Task 2 match-created members.

- [ ] **Step 1: Write failing service tests**

```ts
it("lists only member conversations with peer profile and unread count");
it("returns identical not-found errors for missing and inaccessible conversations");
it("pages messages by opaque createdAt/id cursor without gaps");
it("deduplicates repeated clientMessageId for the same sender");
it("rejects empty, over-2000-character, and closed-match sends");
it("publishes only after the message transaction commits");
it("keeps a committed send successful when publishing fails");
it("advances read state monotonically and publishes the new cursor");
```

- [ ] **Step 2: Run service tests and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-conversations.service.spec.ts`

Expected: FAIL because the conversation domain does not exist.

- [ ] **Step 3: Implement validated DTOs and opaque cursor helpers**

```ts
export class SendRoommateMessageDto {
  @IsUUID() clientMessageId!: string;
  @IsString() @MaxLength(2000) body!: string;
}

export class MarkRoommateConversationReadDto {
  @IsString() @IsNotEmpty() lastReadMessageId!: string;
}

export class RoommateMessagePageQueryDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit = 50;
  @IsOptional() @IsString() cursor?: string;
}
```

Encode/decode `{ createdAt, id }` as base64url JSON and reject malformed cursors with `400`.

- [ ] **Step 4: Implement membership-safe service operations**

Use a single membership lookup helper that returns `NotFoundException("Roommate conversation not found")` for both absent and unauthorized IDs. Derive unread counts from the peer's messages after `lastReadAt`, with `(createdAt, id)` tie handling. Catch the unique `(senderId, clientMessageId)` race and return the existing row.

Before insertion, consume a 20-message/60-second user-and-conversation limit. The local store uses an injected clock and bounded timestamp arrays; the Valkey store uses an atomic Lua sliding-window operation and returns `429` with `retryAfterSeconds` when exhausted.

- [ ] **Step 5: Add guarded HTTP routes**

```ts
@UseGuards(AuthGuard)
@Controller("roommate-conversations")
export class RoommateConversationsController {
  @Get() listMine(@Req() request: AuthenticatedRequest) {}
  @Get(":id/messages") listMessages(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Query() query: RoommateMessagePageQueryDto) {}
  @Post(":id/messages") send(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: SendRoommateMessageDto) {}
  @Post(":id/read") markRead(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: MarkRoommateConversationReadDto) {}
}
```

- [ ] **Step 6: Add HTTP authorization and idempotency tests**

Use three authenticated users. Prove the two members can list/send/read, the third receives the same `404` shape as a missing ID, retry returns the same message ID, and an offline recipient fetches the unread message later.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `pnpm --dir api vitest run test/roommate-conversations.service.spec.ts test/roommate-conversations.e2e.spec.ts`

Expected: all focused tests PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/roommate-conversations api/src/app.module.ts api/test/roommate-conversations.service.spec.ts api/test/roommate-conversations.e2e.spec.ts
git commit -m "feat: add durable roommate conversation API"
```

### Task 4: Add Authenticated Socket.IO Delivery

**Files:**
- Modify: `api/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `api/src/auth/authenticated-user.service.ts`
- Modify: `api/src/auth/auth.guard.ts`
- Create: `api/src/roommate-conversations/roommate-conversations.gateway.ts`
- Create: `api/src/roommate-conversations/socket-adapter.ts`
- Modify: `api/src/roommate-conversations/roommate-conversations.module.ts`
- Modify: `api/src/main.ts`
- Create: `api/test/roommate-conversations.gateway.spec.ts`

**Interfaces:**
- Produces: `AuthenticatedUserService.fromBearerToken(token)` shared by HTTP and socket authentication.
- Produces: `RoommateConversationGateway.publish(event)` implementing `ROOMMATE_CONVERSATION_EVENTS`.
- Produces server events named exactly `roommate.conversation.created`, `roommate.conversation.updated`, `roommate.message.created`, `roommate.message.read`, and `roommate.unread.updated`.

- [ ] **Step 1: Add failing gateway tests**

```ts
it("rejects a socket without a valid JWT");
it("joins only the authenticated user room");
it("emits a committed message to both participant user rooms");
it("never accepts a client-supplied target room");
it("keeps HTTP send successful when socket publication throws");
```

- [ ] **Step 2: Run the gateway test and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-conversations.gateway.spec.ts`

Expected: FAIL because Socket.IO transport is absent.

- [ ] **Step 3: Install matching NestJS Socket.IO packages**

Run: `pnpm --filter sublet-pipeline-api add @nestjs/websockets@10.4.15 @nestjs/platform-socket.io@10.4.15 socket.io @socket.io/redis-adapter`

Keep NestJS package versions aligned with the repository's existing `10.4.15` packages.

- [ ] **Step 4: Extract reusable token authentication**

Move token verification and user reload into `AuthenticatedUserService`. Keep `AuthGuard` error messages and request user shape unchanged; gateway authentication calls the same service.

- [ ] **Step 5: Implement user-scoped gateway events**

Use namespace `/roommate-messaging`, handshake `auth.token`, and `user:${user.id}` rooms. The gateway exposes no client event that joins an arbitrary room. It accepts connection/authentication only; messages are still written through HTTP.

- [ ] **Step 6: Add optional Valkey adapter**

When `VALKEY_URL` is present, create separate pub/sub clients and attach `createAdapter(pubClient, subClient)`. When absent, use the default in-memory adapter. Connection failure logs degraded realtime and leaves HTTP startup behavior explicit; close clients during app shutdown.

- [ ] **Step 7: Run gateway and auth regression tests**

Run: `pnpm --dir api vitest run test/roommate-conversations.gateway.spec.ts test/auth.controller.spec.ts test/http-launch-readiness.e2e.spec.ts`

Expected: focused tests PASS and HTTP auth behavior is unchanged.

- [ ] **Step 8: Commit**

```bash
git add api/package.json pnpm-lock.yaml api/src/auth api/src/roommate-conversations api/src/main.ts api/test/roommate-conversations.gateway.spec.ts
git commit -m "feat: deliver roommate messages in realtime"
```

### Task 5: Add Frontend Conversation State And Realtime Client

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `lib/api.ts`
- Create: `lib/roommate-conversations.ts`
- Create: `lib/roommate-realtime.ts`
- Modify: `lib/message-inbox.ts`
- Create: `tests/roommate-conversations.test.ts`
- Create: `tests/roommate-realtime.test.ts`
- Modify: `tests/message-inbox.test.ts`

**Interfaces:**
- Produces: `ApiRoommateConversation`, `ApiRoommateMessage`, `RoommateRealtimeEvent`, and API functions.
- Produces: `mergeConversationSnapshot`, `mergeRoommateMessage`, `reconcileOptimisticMessage`, `getRoommateUnreadTotal`, and `shouldReportRead`.
- Produces: `createRoommateRealtimeClient({ token, onEvent, onReconnect })` returning `{ connect, disconnect }`.

- [ ] **Step 1: Write failing pure-state tests**

```ts
it("merges HTTP and socket copies by stable message ID");
it("reconciles an optimistic message by clientMessageId");
it("preserves a failed optimistic message for retry");
it("sums unread counts without including the active visible conversation after read");
it("merges listing and roommate inbox contacts by typed key");
it("requests synchronization after every reconnect");
```

- [ ] **Step 2: Run frontend focused tests and confirm RED**

Run: `pnpm vitest run tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/message-inbox.test.ts`

Expected: FAIL because the modules/types are absent.

- [ ] **Step 3: Install the Socket.IO browser client**

Run: `pnpm --filter sublet-pipeline-web add socket.io-client`

- [ ] **Step 4: Add API contracts and pure merge helpers**

Add functions with these exact signatures:

```ts
export function getRoommateConversations(token: string): Promise<ApiRoommateConversation[]>;
export function getRoommateMessages(token: string, conversationId: string, cursor?: string): Promise<ApiRoommateMessagePage>;
export function sendRoommateMessage(token: string, conversationId: string, input: { clientMessageId: string; body: string }): Promise<ApiRoommateMessage>;
export function markRoommateConversationRead(token: string, conversationId: string, lastReadMessageId: string): Promise<ApiRoommateConversationReadState>;
```

All merge helpers are immutable and deduplicate by server message ID first, then `clientMessageId` for optimistic reconciliation.

- [ ] **Step 5: Implement the typed realtime adapter**

Connect to `${API_ORIGIN}/roommate-messaging` with `auth: { token }`, WebSocket-first transport, bounded reconnection, and explicit cleanup. Convert raw event names into the `RoommateRealtimeEvent` union; unknown payloads are ignored rather than trusted.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/message-inbox.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml lib/api.ts lib/roommate-conversations.ts lib/roommate-realtime.ts lib/message-inbox.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/message-inbox.test.ts
git commit -m "feat: add roommate realtime client state"
```

### Task 6: Enable Roommate Chat In The Unified Messages UI

**Files:**
- Modify: `components/sublet-app.tsx`
- Modify: `app/messages/page.tsx`
- Modify: `lib/product-capabilities.ts`
- Create: `tests/sublet-app-roommate-chat.test.ts`

**Interfaces:**
- Consumes: Task 2 action response conversation metadata.
- Consumes: Task 5 API/realtime/state functions.
- Produces: enabled `/messages?roommateId=<profile-id>` and `/messages?conversationId=<id>` flows.

- [ ] **Step 1: Write failing UI contract tests**

Assert that:

```ts
expect(source).not.toContain("室友私信暂未开放");
expect(source).toContain("getRoommateConversations");
expect(source).toContain("createRoommateRealtimeClient");
expect(source).toContain("sendRoommateMessage");
expect(source).toContain("markRoommateConversationRead");
```

Add behavior-level pure tests for route selection, unread badge changes, optimistic retry, and visible-active read reporting.

- [ ] **Step 2: Run focused UI tests and confirm RED**

Run: `pnpm vitest run tests/message-inbox.test.ts tests/roommate-conversations.test.ts tests/sublet-app-roommate-chat.test.ts`

Expected: FAIL because roommate DM handlers are disabled.

- [ ] **Step 3: Load roommate conversations and selected history**

On authenticated startup, load conversation summaries. Select by explicit conversation ID, otherwise map `roommateId` to peer profile ID. Fetch the selected page, merge by ID, and preserve existing listing message state.

- [ ] **Step 4: Connect realtime and recover on reconnect**

Create exactly one socket per token. Apply created/message/read/unread events through pure helpers. On reconnect, refetch summaries and selected messages. Disconnect and clear authenticated roommate state on logout/token replacement.

- [ ] **Step 5: Enable send, retry, and read reporting**

Create a UUID client ID, append an optimistic bubble, send through HTTP, reconcile on success, and retain a retryable failed bubble on error. Mark read only when the selected roommate conversation is rendered and `document.visibilityState === "visible"`.

- [ ] **Step 6: Render roommate conversation content in `MessagesScreen`**

Keep listing-specific tour and listing controls only for `kind: "listing"`. For `kind: "roommate"`, render peer context, paginated text history, unread state, and the common composer. Show only the latest outgoing status label (`发送中`, `发送失败`, `已发送`, or `已读`).

- [ ] **Step 7: Wire match CTAs into the real conversation**

When a reciprocal action returns conversation metadata, navigate to `/messages?conversationId=<id>`. `handleOpenRoommateDm` resolves the matching conversation; if none exists, it explains that mutual matching is required rather than claiming the feature is unavailable.

- [ ] **Step 8: Run focused tests and browser build checks**

Run: `pnpm vitest run tests/message-inbox.test.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/sublet-app-roommate-chat.test.ts`

Run: `pnpm typecheck`

Expected: focused tests and typecheck PASS.

- [ ] **Step 9: Commit**

```bash
git add components/sublet-app.tsx app/messages/page.tsx lib/product-capabilities.ts tests/sublet-app-roommate-chat.test.ts tests/message-inbox.test.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts
git commit -m "feat: enable persistent roommate private chat"
```

### Task 7: Add End-To-End Verification And Operations Documentation

**Files:**
- Modify: `api/test/http-launch-readiness.e2e.spec.ts`
- Modify: `api/test/launch-smoke.spec.ts`
- Create: `api/test/roommate-realtime-smoke.spec.ts`
- Modify: `api/.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: all previous task contracts.
- Produces: repeatable two-user mutual-match, offline-sync, read-receipt, and Socket.IO smoke verification.

- [ ] **Step 1: Write the failing launch journey**

Create two real authenticated users and owned roommate profiles, record opposite-direction likes, assert one shared conversation, send while the recipient socket is disconnected, fetch one unread message, connect both sockets, send another message, mark it read, and assert the sender receives `roommate.message.read`.

- [ ] **Step 2: Run the focused launch smoke and confirm RED**

Run: `pnpm --dir api vitest run test/roommate-realtime-smoke.spec.ts test/http-launch-readiness.e2e.spec.ts`

Expected: FAIL until the complete integration and test support are wired.

- [ ] **Step 3: Complete test support without weakening production code**

Extend the in-memory Prisma mock only with the exact delegates and uniqueness behavior used by match/conversation services. Use a real PostgreSQL test in `launch-smoke.spec.ts` when `RUN_DB_SMOKE=1`; do not replace the database smoke with mocks.

- [ ] **Step 4: Document local and production configuration**

Add `VALKEY_URL` as optional local configuration, document `/roommate-messaging`, explain that offline means database synchronization rather than email, and include the two-account verification sequence. Docker Compose may add a Valkey service only if the API environment opts into it; database-only local startup must remain supported.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --dir api test
pnpm --dir api typecheck
pnpm --dir api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api prisma validate
```

When PostgreSQL is available, also run:

```bash
RUN_DB_SMOKE=1 DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm --dir api launch:smoke
```

Expected: every required command exits `0`; existing listing chat/viewing tests remain green.

- [ ] **Step 6: Commit**

```bash
git add api/test api/.env.example docker-compose.yml README.md
git commit -m "test: verify realtime roommate messaging"
```

### Task 8: Final Review And Migration Safety Gate

**Files:**
- Review all files changed by Tasks 1–7.

**Interfaces:**
- Produces: review-ready feature branch with no unrelated files and fresh verification evidence.

- [ ] **Step 1: Review the diff against the design**

Run: `git diff --stat main...HEAD`

Run: `git diff --check main...HEAD`

Confirm no email/Web Push/attachment/presence scope entered the change and no user-owned output files are included.

- [ ] **Step 2: Apply the migration to a disposable PostgreSQL 16 database**

Run migrations from an empty database and from a database containing existing ownerless demo roommate rows. Confirm existing rows remain and all new constraints/indexes exist.

- [ ] **Step 3: Perform authorization review**

Verify every conversation query/write starts from authenticated membership; socket room names are server-derived; body/token contents are absent from logs; production discovery excludes ownerless rows.

- [ ] **Step 4: Run fresh full verification**

Repeat the complete Task 7 matrix after all review fixes. Record exact pass counts and any deprecation-only warnings.

- [ ] **Step 5: Commit review fixes if needed**

```bash
git add api/prisma api/src/roommates api/src/roommate-conversations api/src/auth api/src/app.module.ts api/src/main.ts api/src/marketplace api/test package.json api/package.json pnpm-lock.yaml lib/api.ts lib/message-inbox.ts lib/roommate-conversations.ts lib/roommate-realtime.ts components/sublet-app.tsx app/messages/page.tsx lib/product-capabilities.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/message-inbox.test.ts tests/sublet-app-roommate-chat.test.ts api/.env.example docker-compose.yml README.md
git commit -m "fix: harden realtime roommate messaging"
```

If no fixes are needed, do not create an empty commit.
