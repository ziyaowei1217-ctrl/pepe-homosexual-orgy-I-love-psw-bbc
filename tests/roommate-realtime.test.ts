import { describe, expect, it, vi } from "vitest";

import { createRoommateRealtimeClient } from "../lib/roommate-realtime";

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

describe("roommate realtime client", () => {
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
      expect.objectContaining({
        auth: { token: "token-a" },
        autoConnect: false,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 8
      })
    );
    expect(fake.socket.connect).toHaveBeenCalledOnce();

    client.disconnect();
    expect(fake.socket.removeAllListeners).toHaveBeenCalledOnce();
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
    fake.emit("roommate.message.read", {
      conversationId: "conversation-a-b",
      self: { lastReadMessageId: 42, lastReadAt: null },
      peer: { lastReadMessageId: null, lastReadAt: null }
    });
    fake.emit("unknown.event", { conversationId: "conversation-a-b" });

    expect(onEvent.mock.calls.map(([event]) => event.name)).toEqual([
      "roommate.message.created",
      "roommate.message.read"
    ]);
  });

  it("forwards only well-formed conversation and unread summary hints", () => {
    const fake = createFakeSocket();
    const onEvent = vi.fn();
    createRoommateRealtimeClient({
      token: "token-a",
      onEvent,
      onReconnect: vi.fn(),
      socketFactory: () => fake.socket
    }).connect();

    fake.emit("roommate.conversation.created", { conversationId: "conversation-a-b" });
    fake.emit("roommate.conversation.updated", {});
    fake.emit("roommate.unread.updated", { conversationId: "conversation-a-b" });
    fake.emit("roommate.unread.updated", { conversationId: 42 });
    fake.emit("roommate.conversation.created", null);

    expect(onEvent.mock.calls.map(([event]) => event)).toEqual([
      {
        name: "roommate.conversation.created",
        payload: { conversationId: "conversation-a-b" }
      },
      { name: "roommate.conversation.updated", payload: {} },
      { name: "roommate.unread.updated", payload: { conversationId: "conversation-a-b" } }
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
    fake.emit("connect");

    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it("does not forward events after disconnect cleanup", () => {
    const fake = createFakeSocket();
    const onEvent = vi.fn();
    const client = createRoommateRealtimeClient({
      token: "token-a",
      onEvent,
      onReconnect: vi.fn(),
      socketFactory: () => fake.socket
    });
    client.connect();
    client.disconnect();

    fake.emit("roommate.conversation.updated", {});

    expect(onEvent).not.toHaveBeenCalled();
  });
});
