# Roommate Messaging Frontend Integration Design

## Summary

Connect the existing durable roommate messaging backend to the existing unified Messages screen. Roommate and listing conversations remain separate domains but share the inbox presentation. PostgreSQL-backed HTTP responses are authoritative; Socket.IO accelerates committed updates; reconnect, browser focus, and initial load recover through HTTP.

This replaces the disabled roommate-chat presentation. It does not revive or migrate the removed browser-local roommate DM store.

## Confirmed Direction

- Deliver the complete first release: history, pagination, optimistic sends, retry, unread counts, read state, realtime events, and reconnect recovery.
- Keep landlord and roommate conversations together in the existing Messages inbox.
- Preserve listing conversation, viewing, and group-tour behavior.
- Support both `/messages?roommateId=<profile-id>` and `/messages?conversationId=<conversation-id>` entry points.
- Keep text-only messages with the backend's 2,000-character limit.
- Do not add attachments, typing indicators, presence, edit, recall, email/Web Push notifications, or local message persistence.

## Considered Approaches

### 1. Bounded frontend messaging domain — selected

Create pure state helpers for conversation/message merging and a small realtime adapter, then let `SubletApp` orchestrate authenticated loading and rendering. This keeps reconciliation, unread, read-cursor, and retry rules testable without rendering the full application.

### 2. HTTP-only integration

Use conversation list/message endpoints and refresh on navigation or focus. This is simpler, but it does not meet the confirmed realtime requirement and gives an unnecessarily stale active conversation.

### 3. Component-local implementation

Put fetch, socket, merge, and retry logic directly in `components/sublet-app.tsx`. It changes fewer files initially, but the component is already large and this approach would make event validation, deduplication, and failure recovery hard to reason about or test.

## Architecture And Boundaries

### API contracts

Extend `lib/api.ts` with frontend-safe types for:

- `ApiRoommateConversation`;
- `ApiRoommateMessage` and optimistic delivery status;
- paginated message responses;
- read-cursor responses;
- roommate conversation HTTP functions.

The HTTP functions use the existing bearer-token request helper and product-error normalization. Message timestamps remain ISO strings at the frontend boundary.

### Pure conversation state

Create `lib/roommate-conversations.ts`. It owns immutable helpers for:

- replacing conversation summaries from an authoritative HTTP snapshot;
- merging a single summary or committed message;
- merging a paginated history response without duplicates;
- reconciling an optimistic message by `clientMessageId`;
- marking an optimistic message failed while preserving its retry identity;
- deriving peer-read status and total unread count;
- deciding when a read report is allowed;
- resolving a URL target to an accessible conversation.

Messages are ordered chronologically in UI state by `(createdAt, id)`. Stable server IDs are the primary deduplication key. `clientMessageId` reconciles the HTTP acknowledgement or socket echo with an optimistic outgoing bubble.

### Realtime adapter

Create `lib/roommate-realtime.ts` as the only module that imports the Socket.IO browser client. It:

- derives the Socket.IO origin from `NEXT_PUBLIC_API_BASE_URL`;
- connects to `/roommate-messaging` with `auth: { token }`;
- exposes `connect()` and `disconnect()` lifecycle methods;
- validates known event payload shapes before forwarding them;
- ignores unknown or malformed events;
- invokes one synchronization callback after every successful reconnect.

The adapter never sends message commands over the socket and never accepts or constructs user-room names.

### Application orchestration

`SubletApp` owns the current authenticated conversation summaries, per-conversation message pages, pagination cursors, loading state, and one realtime client per access token.

On token acquisition it loads summaries. On selected roommate conversation change it loads the newest history page. On socket reconnect or browser focus it refreshes summaries and the selected history. Token replacement or logout disconnects the old socket and clears protected roommate-message state.

Listing conversation state remains on the existing `DealThread` path.

## Data Flow

### Initial load and selection

1. Load authenticated roommate conversation summaries.
2. Convert them to roommate `InboxContact` rows and merge them with listing contacts by activity time.
3. Resolve an explicit `conversationId` first; otherwise resolve `roommateId` against `conversation.peer.id`.
4. An invalid or inaccessible route target selects no roommate conversation and cannot create a contact.
5. Load the selected conversation's newest message page and render it chronologically.

### Send and retry

1. Trim the draft and reject empty or over-limit input before mutation.
2. Generate one UUID `clientMessageId` and append an optimistic outgoing bubble with `sending` state.
3. Send through authenticated HTTP.
4. Reconcile the acknowledgement or socket echo using server ID and then client ID.
5. On failure, keep the bubble with `failed` state and expose Retry.
6. Retry uses the original `clientMessageId`, preserving backend idempotency.

The composer clears after an optimistic message is accepted into local state. It is keyed by conversation ID so drafts cannot leak between recipients.

### Realtime and recovery

- `roommate.message.created` merges the committed message and refreshes conversation ordering/preview.
- `roommate.message.read` advances visible read state monotonically.
- conversation or unread summary events trigger an HTTP summary refresh because the list endpoint is authoritative.
- duplicate socket and HTTP copies collapse by ID/client ID.
- reconnect and browser focus refetch summaries and selected history, repairing missed events.

### Read reporting

Read state advances only when:

- the selected contact is a roommate conversation;
- the document is visible;
- a peer message is present beyond the current self read cursor;
- no report for that same last message is already pending or completed.

The UI updates unread state after the server confirms the read command. Repeated or stale reports remain harmless because the backend cursor is monotonic.

## User Experience

### Unified inbox

Roommate rows show peer avatar/name, role context, latest preview/time, and an unread badge. The Messages navigation badge includes the server-backed roommate unread total. Listing rows and controls remain unchanged.

On narrow screens, `/messages` shows contacts and a targeted URL shows the conversation with the existing back action. Desktop keeps the split view.

### Roommate conversation panel

The panel shows peer identity, writable/read-only state, chronological messages, a load-older control when `nextCursor` exists, and the composer. Only the latest outgoing message shows a delivery label: `发送中`, `发送失败`, `已发送`, or `已读`.

A new match with no messages shows a purposeful prompt rather than a fabricated welcome message. A closed match preserves history and disables sending with explanatory text.

### Entry points

When a reciprocal roommate action returns conversation metadata, the app opens the real conversation route. Existing roommate DM buttons look up a server conversation by peer profile ID. If no conversation exists, the app explains that a reciprocal real-user match is required.

## Error Handling

- Conversation-list failure leaves listing messages usable and shows a non-destructive product error.
- History failure shows a retryable conversation error without dropping previously loaded messages.
- Send failure retains a retryable bubble; authentication failure follows the existing session-clearing path.
- Socket connection failure does not block HTTP reads or writes and does not claim messages were lost.
- Malformed realtime payloads are ignored.
- A `429` uses the existing product-error message and leaves the outgoing message retryable.
- A closed conversation stays readable and clearly disables the composer.

## Testing

### Pure state tests

- HTTP and socket copies deduplicate by server ID.
- Optimistic messages reconcile by `clientMessageId`.
- Failed messages retain their retry identity.
- Pagination merges without gaps or reordering.
- Read cursors and unread totals advance monotonically.
- Route targets resolve only to loaded accessible conversations.

### Realtime adapter tests

- Correct namespace, token handshake, and explicit cleanup.
- Known events are validated and forwarded.
- Malformed and unknown events are ignored.
- Reconnect invokes HTTP synchronization once per reconnect.

### Application and UI tests

- Authenticated startup requests conversation summaries.
- A roommate route loads and renders history in the unified inbox.
- Send, failure, and retry use one client ID.
- Visible active peer messages report read; hidden or inactive views do not.
- Unread badges and latest previews update after realtime events.
- Listing-message and responsive-navigation regression tests remain green.

### Completion gate

- Focused frontend tests pass.
- Full frontend lint, typecheck, test suite, and production build pass.
- API tests, typecheck, and build remain green.
- Browser verification covers desktop and narrow inbox selection, send, retry presentation, unread clearing, and refresh recovery without console errors.

## Scope Boundaries

- No backend schema or behavior change is planned unless frontend integration exposes a verified contract defect.
- No localStorage migration or fallback for roommate messages.
- No conversion of listing messages to Socket.IO.
- No notification channel outside the in-app unread presentation.
- No attachments, groups, typing, presence, edit, recall, blocking, reporting, moderation provider, or end-to-end encryption claim.

## Acceptance Criteria

- Real reciprocal matches appear as roommate contacts in the unified Messages inbox.
- Selecting or deep-linking to an accessible conversation loads durable history.
- Text messages send optimistically, reconcile durably, and can be retried idempotently.
- Connected peers receive committed changes without refresh.
- Missed events recover through HTTP after reconnect, focus, or reload.
- Unread counts clear only after an active visible conversation is reported read.
- Latest outgoing messages accurately show sent/read/failure state.
- Listing messaging and mobile/desktop inbox behavior do not regress.
