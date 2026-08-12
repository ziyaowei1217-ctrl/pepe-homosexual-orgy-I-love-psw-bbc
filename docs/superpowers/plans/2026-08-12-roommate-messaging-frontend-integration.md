# Roommate Messaging Frontend Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable durable realtime roommate text chat in the existing unified Messages inbox using the already-launched authenticated backend.

**Architecture:** Add a pure frontend conversation-state module and a small validated Socket.IO adapter, then let `SubletApp` orchestrate authenticated HTTP synchronization, optimistic sends, retries, read reporting, and rendering. PostgreSQL-backed HTTP responses remain authoritative; Socket.IO only accelerates committed events and reconnect always repairs state through HTTP.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Socket.IO Client 4.8.3, Vitest 2, NestJS 10 backend contracts.

## Global Constraints

- Keep landlord and roommate conversations together in the existing Messages inbox.
- Preserve the listing `DealThread`, viewing, and group-tour behavior.
- Support `/messages?roommateId=<profile-id>` and `/messages?conversationId=<conversation-id>`.
- Use HTTP for all message/read writes and recovery; the socket never writes application data.
- Deduplicate committed messages by server ID and reconcile optimistic sends by `clientMessageId`.
- Retry a failed send with the original `clientMessageId`.
- Report read only for the selected roommate conversation while the document is visible.
- Keep text-only messages trimmed to 1–2,000 characters.
- Do not use localStorage for roommate message content.
- Do not add attachments, typing, presence, edit, recall, blocking, reporting, email/Web Push, or listing-message realtime.
- Do not stage or modify unrelated output, presentation, chart, temporary, or user-owned files.

---

## File Structure

### Frontend messaging domain

- Modify `lib/api.ts`: exact backend conversation, message, and read contracts plus authenticated HTTP wrappers.
- Create `lib/roommate-conversations.ts`: immutable message/conversation reconciliation, ordering, unread, read-gate, and route-resolution helpers.
- Create `lib/roommate-realtime.ts`: Socket.IO lifecycle, payload validation, known-event adapter, and reconnect callback.
- Modify `lib/message-inbox.ts`: optional unread count on typed inbox contacts.

### Application and presentation

- Modify `lib/app-routes.ts`: conversation-ID roommate message routes.
- Modify `app/messages/page.tsx`: forward `conversationId` from the URL.
- Modify `components/sublet-app.tsx`: authenticated state orchestration and roommate conversation UI.

### Tests and documentation

- Create `tests/roommate-conversations.test.ts`: pure state and route-resolution tests.
- Create `tests/roommate-realtime.test.ts`: socket options, validation, cleanup, and reconnect tests with an injected client factory.
- Modify `tests/message-inbox.test.ts`: unread contact compatibility.
- Modify `tests/app-routes.test.ts`: conversation-ID routes.
- Create `tests/sublet-app-roommate-chat.test.tsx`: authenticated UI loading, selection, send/retry, and read-gate coverage.
- Modify `README.md`: mark the frontend integration as available and retain explicit non-goals.

---

### Task 1: Add HTTP Contracts And Pure Conversation State

**Files:**
- Modify: `lib/api.ts`
- Create: `lib/roommate-conversations.ts`
- Create: `tests/roommate-conversations.test.ts`
- Modify: `lib/message-inbox.ts`
- Modify: `tests/message-inbox.test.ts`

**Interfaces:**
- Produces: `getRoommateConversations(token)`.
- Produces: `getRoommateMessages(token, conversationId, cursor?)`.
- Produces: `sendRoommateMessage(token, conversationId, { clientMessageId, body })`.
- Produces: `markRoommateConversationRead(token, conversationId, lastReadMessageId)`.
- Produces: `mergeRoommateMessages`, `createOptimisticRoommateMessage`, `reconcileRoommateMessage`, `markRoommateMessageFailed`, `mergeRoommateMessageIntoConversations`, `applyRoommateReadState`, `getRoommateUnreadTotal`, `resolveRoommateConversationTarget`, and `shouldReportRoommateRead`.

- [ ] **Step 1: Write failing API-contract and pure-state tests**

Create fixtures matching the backend serializer and assert the exact public behavior:

```ts
const conversation: ApiRoommateConversation = {
  id: "conversation-a-b",
  matchId: "match-a-b",
  peer: {
    id: "profile-b",
    name: "Mia Chen",
    age: 24,
    role: "UCLA MSBA",
    image: "/mia.jpg",
    match: 94,
    budget: "$1,500",
    commute: "15 min",
    tags: ["安静"]
  },
  latestMessage: null,
  unreadCount: 0,
  lastReadMessageId: null,
  lastReadAt: null,
  peerLastReadMessageId: null,
  peerLastReadAt: null,
  writable: true,
  lastMessageAt: null,
  updatedAt: "2026-08-12T00:00:00.000Z"
};

it("reconciles the HTTP acknowledgement with one optimistic bubble", () => {
  const optimistic = createOptimisticRoommateMessage({
    conversationId: conversation.id,
    clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
    body: "  你好  ",
    createdAt: "2026-08-12T00:00:01.000Z"
  });
  const committed = { ...optimistic, id: "message-1", body: "你好", deliveryStatus: "sent" as const };

  expect(reconcileRoommateMessage([optimistic], committed)).toEqual([committed]);
});

it("retains the original client id after a failed send", () => {
  const optimistic = createOptimisticRoommateMessage({
    conversationId: conversation.id,
    clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
    body: "你好",
    createdAt: "2026-08-12T00:00:01.000Z"
  });

  expect(markRoommateMessageFailed([optimistic], optimistic.clientMessageId)[0]).toMatchObject({
    clientMessageId: optimistic.clientMessageId,
    deliveryStatus: "failed"
  });
});

it("resolves only a loaded conversation id or peer profile id", () => {
  expect(resolveRoommateConversationTarget([conversation], { conversationId: conversation.id })).toBe(conversation);
  expect(resolveRoommateConversationTarget([conversation], { peerProfileId: "profile-b" })).toBe(conversation);
  expect(resolveRoommateConversationTarget([conversation], { conversationId: "missing" })).toBeNull();
});

it("reports read only for the active visible conversation and a newer peer message", () => {
  expect(shouldReportRoommateRead({
    activeConversationId: conversation.id,
    conversationId: conversation.id,
    documentVisible: true,
    lastPeerMessageId: "message-2",
    lastReadMessageId: "message-1",
    pendingMessageId: null
  })).toBe(true);
});
```

Extend `tests/message-inbox.test.ts` with a contact containing `unreadCount: 3` and prove `mergeInboxContacts` preserves it.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm vitest run tests/roommate-conversations.test.ts tests/message-inbox.test.ts`

Expected: FAIL because the conversation module, API types, and unread contact field do not exist.

- [ ] **Step 3: Add exact API types and wrappers**

Add these public contracts to `lib/api.ts`:

```ts
export type ApiRoommateMessage = {
  id: string;
  conversationId: string;
  senderRole: "self" | "peer";
  clientMessageId: string;
  body: string;
  createdAt: string;
};

export type ApiRoommateConversation = {
  id: string;
  matchId: string;
  peer: {
    id: string | null;
    name: string | null;
    age: number | null;
    role: string | null;
    image: string | null;
    match: number | null;
    budget: string | null;
    commute: string | null;
    tags: string[];
  };
  latestMessage: ApiRoommateMessage | null;
  unreadCount: number;
  lastReadMessageId: string | null;
  lastReadAt: string | null;
  peerLastReadMessageId: string | null;
  peerLastReadAt: string | null;
  writable: boolean;
  lastMessageAt: string | null;
  updatedAt: string;
};

export type ApiRoommateMessagePage = {
  messages: ApiRoommateMessage[];
  nextCursor: string | null;
};

export type ApiRoommateConversationReadState = {
  conversationId: string;
  self: { lastReadMessageId: string | null; lastReadAt: string | null };
  peer: { lastReadMessageId: string | null; lastReadAt: string | null };
};
```

Implement wrappers with encoded path and cursor values. Extend `ApiRoommateActionResponse` with nullable `match` and `conversation: { id: string; matchId: string } | null` while retaining `dealRoom` compatibility.

- [ ] **Step 4: Implement immutable state helpers**

Use this UI type and rules in `lib/roommate-conversations.ts`:

```ts
export type RoommateMessageView = ApiRoommateMessage & {
  deliveryStatus: "sending" | "sent" | "failed";
};

export type RoommateConversationTarget = {
  conversationId?: string | null;
  peerProfileId?: string | null;
};
```

Normalize server messages to `deliveryStatus: "sent"`; sort oldest-first by ISO timestamp and ID; deduplicate server IDs first and then self-message client IDs. `mergeRoommateMessageIntoConversations` updates the summary preview/activity, moves it through derived sort order, and increments unread exactly once only for a newly merged peer message. `applyRoommateReadState` updates self/peer cursors and sets unread to zero only for a confirmed self cursor.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `pnpm vitest run tests/roommate-conversations.test.ts tests/message-inbox.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/api.ts lib/roommate-conversations.ts lib/message-inbox.ts tests/roommate-conversations.test.ts tests/message-inbox.test.ts
git commit -m "feat: add roommate conversation client state"
```

---

### Task 2: Add The Validated Realtime Client

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `lib/roommate-realtime.ts`
- Create: `tests/roommate-realtime.test.ts`

**Interfaces:**
- Consumes: `ApiRoommateMessage` and `ApiRoommateConversationReadState` from Task 1.
- Produces: `RoommateRealtimeEvent`.
- Produces: `createRoommateRealtimeClient({ token, onEvent, onReconnect, socketFactory? })` returning `{ connect(): void; disconnect(): void }`.

- [ ] **Step 1: Write failing adapter tests with an injected fake socket**

```ts
function createFakeSocket() {
  const handlers = new Map<string, Array<(payload?: unknown) => void>>();
  const socket = {
    on: vi.fn((name: string, handler: (payload?: unknown) => void) => {
      handlers.set(name, [...(handlers.get(name) ?? []), handler]);
      return socket;
    }),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(() => handlers.clear())
  };

  return {
    socket,
    emit(name: string, payload?: unknown) {
      for (const handler of handlers.get(name) ?? []) handler(payload);
    }
  };
}

it("connects to the roommate namespace with the bearer token and cleans up", () => {
  const fake = createFakeSocket();
  const factory = vi.fn(() => fake.socket);
  const client = createRoommateRealtimeClient({
    token: "token-a",
    onEvent: vi.fn(),
    onReconnect: vi.fn(),
    socketFactory: factory
  });

  client.connect();
  expect(factory).toHaveBeenCalledWith(
    "http://localhost:4000/roommate-messaging",
    expect.objectContaining({ auth: { token: "token-a" }, autoConnect: false })
  );
  client.disconnect();
  expect(fake.socket.disconnect).toHaveBeenCalledOnce();
});

it("forwards valid committed message and read events but ignores malformed payloads", () => {
  const fake = createFakeSocket();
  const onEvent = vi.fn();
  createRoommateRealtimeClient({
    token: "token-a",
    onEvent,
    onReconnect: vi.fn(),
    socketFactory: () => fake.socket
  }).connect();
  fake.emit("roommate.message.created", {
    conversationId: "conversation-a-b",
    message: {
      id: "message-1",
      conversationId: "conversation-a-b",
      senderRole: "peer",
      clientMessageId: "6bd26a89-51e1-45b4-a441-0cf001bdd467",
      body: "Hello",
      createdAt: "2026-08-12T00:00:01.000Z"
    }
  });
  fake.emit("roommate.message.read", {
    conversationId: "conversation-a-b",
    self: { lastReadMessageId: "message-1", lastReadAt: "2026-08-12T00:00:01.000Z" },
    peer: { lastReadMessageId: null, lastReadAt: null }
  });
  fake.emit("roommate.message.created", { conversationId: 42 });

  expect(onEvent.mock.calls.map(([event]) => event.name)).toEqual([
    "roommate.message.created",
    "roommate.message.read"
  ]);
});

it("requests authoritative synchronization after reconnect, not initial connect", () => {
  const fake = createFakeSocket();
  const onReconnect = vi.fn();
  createRoommateRealtimeClient({
    token: "token-a",
    onEvent: vi.fn(),
    onReconnect,
    socketFactory: () => fake.socket
  }).connect();

  fake.emit("connect");
  fake.emit("disconnect");
  fake.emit("connect");

  expect(onReconnect).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the realtime test and confirm RED**

Run: `pnpm vitest run tests/roommate-realtime.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Add the browser Socket.IO dependency**

Run: `pnpm --filter sublet-pipeline-web add socket.io-client@4.8.3`

Expected: root `package.json` declares `socket.io-client` and the lockfile changes only for the root importer when the package is already present transitively.

- [ ] **Step 4: Implement strict event validation and lifecycle**

Define this event union:

```ts
export type RoommateRealtimeEvent =
  | { name: "roommate.message.created"; payload: { conversationId: string; message: ApiRoommateMessage } }
  | { name: "roommate.message.read"; payload: ApiRoommateConversationReadState }
  | { name: "roommate.conversation.created" | "roommate.conversation.updated" | "roommate.unread.updated"; payload: { conversationId?: string } };
```

Derive the origin by removing the `/api/v1` suffix from `NEXT_PUBLIC_API_BASE_URL`, append `/roommate-messaging`, and use `transports: ["websocket", "polling"]`, `reconnectionAttempts: 8`, and `autoConnect: false`. Register exact known event names. Validate every required property before calling `onEvent`. Track whether a prior connection succeeded so initial connect does not cause a redundant synchronization and a later connect does.

- [ ] **Step 5: Run realtime and state tests**

Run: `pnpm vitest run tests/roommate-realtime.test.ts tests/roommate-conversations.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml lib/roommate-realtime.ts tests/roommate-realtime.test.ts
git commit -m "feat: add roommate realtime browser client"
```

---

### Task 3: Enable Roommate Conversations In The Unified Messages UI

**Files:**
- Modify: `lib/app-routes.ts`
- Modify: `app/messages/page.tsx`
- Modify: `components/sublet-app.tsx`
- Modify: `tests/app-routes.test.ts`
- Create: `tests/sublet-app-roommate-chat.test.tsx`

**Interfaces:**
- Consumes: all Task 1 API/state helpers and Task 2 realtime client.
- Produces: selected server conversation history, optimistic send/retry, unread/read state, realtime updates, and recovery in `MessagesScreen`.

- [ ] **Step 1: Write failing route and source-boundary tests**

Extend route tests:

```ts
expect(dmRouteForTarget({ kind: "roommate", id: "profile-b" }, { conversationId: "conversation-a-b" }))
  .toBe("/messages?conversationId=conversation-a-b");
```

Create `tests/sublet-app-roommate-chat.test.tsx` using the repository's existing mocked `next/navigation`, memory storage, and mocked API pattern. Assert:

```ts
expect(renderedText(renderer.root)).not.toContain("室友私信暂未开放");
expect(vi.mocked(api.getRoommateConversations)).toHaveBeenCalledWith("stored-token");
expect(vi.mocked(api.getRoommateMessages)).toHaveBeenCalledWith(
  "stored-token",
  "conversation-a-b"
);
```

Cover a successful optimistic send, a failed send that renders `重新发送`, and a visible active peer message that calls `markRoommateConversationRead`. Keep the realtime client mocked at this integration boundary.

- [ ] **Step 2: Run UI-focused tests and confirm RED**

Run: `pnpm vitest run tests/app-routes.test.ts tests/sublet-app-roommate-chat.test.tsx`

Expected: FAIL because conversation routing and UI orchestration are absent.

- [ ] **Step 3: Add conversation-ID routing**

Extend `dmRouteForTarget` options with `conversationId?: string | null`. When present for a roommate target, emit only `?conversationId=<encoded>`. Update `app/messages/page.tsx` to forward `initialRoommateConversationId`, and add that optional prop to `SubletApp`.

- [ ] **Step 4: Add authenticated conversation state and HTTP synchronization**

In `SubletApp`, add:

```ts
const [roommateConversations, setRoommateConversations] = useState<ApiRoommateConversation[]>([]);
const [roommateMessages, setRoommateMessages] = useState<Record<string, RoommateMessageView[]>>({});
const [roommateMessageCursors, setRoommateMessageCursors] = useState<Record<string, string | null>>({});
const [roommateHistoryLoading, setRoommateHistoryLoading] = useState<Set<string>>(new Set());
const [roommateHistoryErrors, setRoommateHistoryErrors] = useState<Record<string, string>>({});
const [pendingReadMessageIds, setPendingReadMessageIds] = useState<Record<string, string>>({});
```

Create stable callbacks to refresh summaries and newest selected history. Clear all protected state when the token becomes null. Resolve the selected conversation by explicit conversation ID first and peer profile ID second. Convert summaries into roommate inbox rows and merge them with listing rows.

- [ ] **Step 5: Connect one realtime client per token and recover**

Create the client in a token-scoped effect. Merge message/read events through Task 1 helpers; refetch summaries for conversation/unread events. The adapter `onReconnect` refreshes summaries and selected history. Add a `visibilitychange` listener that performs the same bounded refresh when the document becomes visible. Cleanup disconnects the socket and removes the listener.

- [ ] **Step 6: Implement optimistic send, failed retry, pagination, and read reporting**

For a new send, create `crypto.randomUUID()`, append one optimistic message, then call the HTTP wrapper. Reconcile success and mark failure without deleting the bubble. Retry calls the same send wrapper with the failed message's existing client ID and body.

For `load older`, request the stored cursor and merge without replacing newer messages. For read reporting, derive the last peer message and call `shouldReportRoommateRead`; after HTTP success apply the returned state and clear the conversation unread count.

- [ ] **Step 7: Render the roommate branch in `MessagesScreen`**

Add `RoommateConversationPanel` with:

- peer avatar, name, role, writable badge, and empty-history prompt;
- chronological bubbles and only the latest self message's delivery label;
- `加载更早消息` when a cursor exists;
- a 2,000-character composer with quick replies that fill but do not send;
- disabled read-only copy for a closed match;
- `重新发送` on failed outgoing messages.

Add `unreadCount?: number` to inbox rows and render a numeric badge. Replace all disabled-roommate copy with unified/server-backed wording. Key the composer by conversation ID.

- [ ] **Step 8: Wire roommate entry points to server conversations**

When `handleAcceptRoommate` receives `response.conversation`, refresh summaries and route to its conversation ID. `handleOpenRoommateDm` looks up `conversation.peer.id === targetRoommate.id`; if absent, show `双方互相喜欢后，室友私信会自动创建。` and do not navigate.

- [ ] **Step 9: Run focused tests and static checks**

Run: `pnpm vitest run tests/app-routes.test.ts tests/message-inbox.test.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/sublet-app-roommate-chat.test.tsx`

Run: `pnpm exec eslint components/sublet-app.tsx app/messages/page.tsx lib/app-routes.ts lib/roommate-conversations.ts lib/roommate-realtime.ts tests/sublet-app-roommate-chat.test.tsx --max-warnings=0`

Run: `pnpm typecheck`

Expected: focused tests, lint, and typecheck PASS.

- [ ] **Step 10: Commit**

```bash
git add components/sublet-app.tsx app/messages/page.tsx lib/app-routes.ts lib/message-inbox.ts tests/app-routes.test.ts tests/message-inbox.test.ts tests/sublet-app-roommate-chat.test.tsx
git commit -m "feat: enable persistent roommate private chat"
```

---

### Task 4: Documentation, Full Verification, And Browser Regression

**Files:**
- Modify: `README.md`
- Verify: all files changed by Tasks 1–3

**Interfaces:**
- Consumes: the completed frontend integration.
- Produces: current product documentation and fresh release evidence.

- [ ] **Step 1: Update README scope**

State that the web app now integrates roommate conversation history, unread/read state, optimistic text sending/retry, realtime events, and HTTP reconnect recovery. Remove `roommate messaging frontend integration` from the unwired list. Retain every documented messaging non-goal.

- [ ] **Step 2: Run focused and full frontend verification**

Run:

```bash
pnpm vitest run tests/app-routes.test.ts tests/message-inbox.test.ts tests/roommate-conversations.test.ts tests/roommate-realtime.test.ts tests/sublet-app-roommate-chat.test.tsx
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: every command exits `0`.

- [ ] **Step 3: Run backend regression verification**

Run:

```bash
pnpm -C api test
pnpm -C api typecheck
pnpm -C api build
DATABASE_URL='postgresql://sublet:sublet@localhost:5432/sublet_pipeline?schema=public' pnpm -C api prisma validate
```

Expected: every command exits `0`; database/Valkey opt-in suites skip cleanly when their flags are absent.

- [ ] **Step 4: Verify browser behavior**

Run the local stack and verify desktop and narrow widths:

1. Signed-in users see server-created roommate contacts mixed with listing contacts by activity.
2. Selecting a roommate loads history and produces a durable conversation URL.
3. Sending shows an optimistic bubble, then `已发送`; a forced HTTP failure shows `发送失败` and `重新发送`.
4. A committed realtime peer message appears once and updates the inbox preview/unread state.
5. Opening the visible conversation clears unread through the read endpoint and shows `已读` to the peer after the event.
6. Refresh and socket reconnect recover the same unique history through HTTP.
7. Mobile back returns to contacts; desktop retains the split view.
8. Listing messaging, viewing controls, and listing navigation remain functional.
9. Browser console has no application errors.

- [ ] **Step 5: Review scope and diff**

Run: `git diff --check HEAD~3..HEAD && git status --short`

Confirm no local message persistence, socket write command, new chat scope, or unrelated user-owned file entered the change.

- [ ] **Step 6: Commit documentation and verification fixes**

```bash
git add README.md
git commit -m "docs: complete roommate messaging frontend rollout"
```

If verification required a scoped code or test fix, stage only those exact files. Do not create an empty commit.
