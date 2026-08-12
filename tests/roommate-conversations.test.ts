import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRoommateConversations,
  getRoommateMessages,
  markRoommateConversationRead,
  sendRoommateMessage,
  type ApiRoommateConversation,
  type ApiRoommateMessage
} from "../lib/api";
import {
  applyRoommateReadState,
  createOptimisticRoommateMessage,
  getRoommateUnreadTotal,
  markRoommateMessageFailed,
  mergeRoommateMessageIntoConversations,
  mergeRoommateMessages,
  reconcileRoommateMessage,
  resolveRoommateConversationTarget,
  shouldReportRoommateRead,
  type RoommateMessageView
} from "../lib/roommate-conversations";

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

function serverMessage(overrides: Partial<ApiRoommateMessage> = {}): ApiRoommateMessage {
  return {
    id: "message-1",
    conversationId: conversation.id,
    senderRole: "peer",
    clientMessageId: "6bd26a89-51e1-45b4-a441-0cf001bdd467",
    body: "Hello",
    createdAt: "2026-08-12T00:00:01.000Z",
    ...overrides
  };
}

describe("roommate conversation API", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
    );
  });

  it("uses authenticated encoded HTTP routes for list, history, send, and read", async () => {
    await getRoommateConversations("token-a");
    await getRoommateMessages("token-a", "conversation/a", "cursor/+=");
    await sendRoommateMessage("token-a", "conversation/a", {
      clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      body: "你好"
    });
    await markRoommateConversationRead("token-a", "conversation/a", "message/1");

    const calls = vi.mocked(fetch).mock.calls as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      "http://localhost:4000/api/v1/roommate-conversations",
      "http://localhost:4000/api/v1/roommate-conversations/conversation%2Fa/messages?cursor=cursor%2F%2B%3D",
      "http://localhost:4000/api/v1/roommate-conversations/conversation%2Fa/messages",
      "http://localhost:4000/api/v1/roommate-conversations/conversation%2Fa/read"
    ]);
    expect(calls.map(([, init]) => init.headers)).toEqual([
      expect.objectContaining({ Authorization: "Bearer token-a" }),
      expect.objectContaining({ Authorization: "Bearer token-a" }),
      expect.objectContaining({ Authorization: "Bearer token-a" }),
      expect.objectContaining({ Authorization: "Bearer token-a" })
    ]);
    expect(calls[2][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({
        clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
        body: "你好"
      })
    });
    expect(calls[3][1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ lastReadMessageId: "message/1" })
    });
  });
});

describe("roommate conversation state", () => {
  it("creates a trimmed optimistic self message", () => {
    expect(
      createOptimisticRoommateMessage({
        conversationId: conversation.id,
        clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
        body: "  你好  ",
        createdAt: "2026-08-12T00:00:01.000Z"
      })
    ).toEqual({
      id: "optimistic:7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      conversationId: conversation.id,
      senderRole: "self",
      clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      body: "你好",
      createdAt: "2026-08-12T00:00:01.000Z",
      deliveryStatus: "sending"
    });
  });

  it("reconciles the HTTP acknowledgement with one optimistic bubble", () => {
    const optimistic = createOptimisticRoommateMessage({
      conversationId: conversation.id,
      clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      body: "  你好  ",
      createdAt: "2026-08-12T00:00:01.000Z"
    });
    const committed = serverMessage({
      id: "message-1",
      senderRole: "self",
      clientMessageId: optimistic.clientMessageId,
      body: "你好"
    });

    expect(reconcileRoommateMessage([optimistic], committed)).toEqual([
      { ...committed, deliveryStatus: "sent" }
    ]);
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

  it("merges pagination and realtime copies chronologically without duplicates", () => {
    const newest = serverMessage({ id: "message-3", createdAt: "2026-08-12T00:00:03.000Z" });
    const oldest = serverMessage({ id: "message-1", createdAt: "2026-08-12T00:00:01.000Z" });
    const middle = serverMessage({ id: "message-2", createdAt: "2026-08-12T00:00:02.000Z" });

    expect(mergeRoommateMessages([newest], [middle, oldest, newest]).map((message) => message.id)).toEqual([
      "message-1",
      "message-2",
      "message-3"
    ]);
  });

  it("deduplicates an optimistic self message by client id when the server copy arrives", () => {
    const optimistic = createOptimisticRoommateMessage({
      conversationId: conversation.id,
      clientMessageId: "7e4ac8e6-21dc-4e68-961b-42b4ca33dc8b",
      body: "你好",
      createdAt: "2026-08-12T00:00:01.000Z"
    });
    const committed = serverMessage({
      id: "message-2",
      senderRole: "self",
      clientMessageId: optimistic.clientMessageId,
      body: optimistic.body
    });

    expect(mergeRoommateMessages([optimistic], [committed])).toEqual([
      { ...committed, deliveryStatus: "sent" }
    ]);
  });

  it("updates the latest preview and increments unread only once for a new peer message", () => {
    const message = serverMessage();
    const once = mergeRoommateMessageIntoConversations([conversation], message);
    const twice = mergeRoommateMessageIntoConversations(once, message);

    expect(once[0]).toMatchObject({ latestMessage: message, unreadCount: 1, lastMessageAt: message.createdAt });
    expect(twice[0]).toMatchObject({ latestMessage: message, unreadCount: 1 });
  });

  it("does not increment unread for a self message", () => {
    const message = serverMessage({ senderRole: "self" });

    expect(mergeRoommateMessageIntoConversations([conversation], message)[0]).toMatchObject({
      latestMessage: message,
      unreadCount: 0
    });
  });

  it("applies confirmed read state monotonically and clears self unread", () => {
    const withUnread = { ...conversation, unreadCount: 3 };
    const advanced = applyRoommateReadState([withUnread], {
      conversationId: conversation.id,
      self: { lastReadMessageId: "message-2", lastReadAt: "2026-08-12T00:00:02.000Z" },
      peer: { lastReadMessageId: "message-1", lastReadAt: "2026-08-12T00:00:01.000Z" }
    });
    const stale = applyRoommateReadState(advanced, {
      conversationId: conversation.id,
      self: { lastReadMessageId: "message-1", lastReadAt: "2026-08-12T00:00:01.000Z" },
      peer: { lastReadMessageId: null, lastReadAt: null }
    });

    expect(advanced[0]).toMatchObject({
      unreadCount: 0,
      lastReadMessageId: "message-2",
      peerLastReadMessageId: "message-1"
    });
    expect(stale).toEqual(advanced);
  });

  it("sums non-negative unread counts", () => {
    expect(getRoommateUnreadTotal([conversation, { ...conversation, id: "conversation-c-d", unreadCount: 3 }])).toBe(3);
  });

  it("resolves only a loaded conversation id or peer profile id", () => {
    expect(resolveRoommateConversationTarget([conversation], { conversationId: conversation.id })).toBe(conversation);
    expect(resolveRoommateConversationTarget([conversation], { peerProfileId: "profile-b" })).toBe(conversation);
    expect(resolveRoommateConversationTarget([conversation], { conversationId: "missing" })).toBeNull();
  });

  it.each([
    [true, conversation.id, conversation.id, true, "message-2", "message-1", null],
    [false, "conversation-other", conversation.id, true, "message-2", "message-1", null],
    [false, conversation.id, conversation.id, false, "message-2", "message-1", null],
    [false, conversation.id, conversation.id, true, "message-1", "message-1", null],
    [false, conversation.id, conversation.id, true, "message-2", "message-1", "message-2"]
  ] as const)(
    "returns %s from the read gate for the active/visible/cursor combination",
    (expected, activeConversationId, conversationId, documentVisible, lastPeerMessageId, lastReadMessageId, pendingMessageId) => {
      expect(
        shouldReportRoommateRead({
          activeConversationId,
          conversationId,
          documentVisible,
          lastPeerMessageId,
          lastReadMessageId,
          pendingMessageId
        })
      ).toBe(expected);
    }
  );
});

const _deliveryStatusContract: RoommateMessageView["deliveryStatus"] = "sent";
void _deliveryStatusContract;
