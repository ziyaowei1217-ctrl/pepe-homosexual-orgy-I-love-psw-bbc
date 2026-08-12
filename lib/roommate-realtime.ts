import { io, type ManagerOptions, type SocketOptions } from "socket.io-client";

import type { ApiRoommateConversationReadState, ApiRoommateMessage } from "./api";

export type RoommateRealtimeEvent =
  | {
      name: "roommate.message.created";
      payload: { conversationId: string; message: ApiRoommateMessage };
    }
  | { name: "roommate.message.read"; payload: ApiRoommateConversationReadState }
  | {
      name: "roommate.conversation.created" | "roommate.conversation.updated" | "roommate.unread.updated";
      payload: { conversationId?: string };
    };

type RoommateSocket = {
  on(name: string, handler: (payload?: unknown) => void): unknown;
  connect(): unknown;
  disconnect(): unknown;
  removeAllListeners(): unknown;
};

type RoommateSocketOptions = Partial<ManagerOptions & SocketOptions>;
type RoommateSocketFactory = (url: string, options: RoommateSocketOptions) => RoommateSocket;

type CreateRoommateRealtimeClientOptions = {
  token: string;
  onEvent: (event: RoommateRealtimeEvent) => void;
  onReconnect: () => void;
  socketFactory?: RoommateSocketFactory;
};

const EVENT_NAMES = [
  "roommate.message.created",
  "roommate.message.read",
  "roommate.conversation.created",
  "roommate.conversation.updated",
  "roommate.unread.updated"
] as const;

export function createRoommateRealtimeClient(options: CreateRoommateRealtimeClientOptions) {
  let socket: RoommateSocket | null = null;
  let connectedBefore = false;
  const socketFactory: RoommateSocketFactory = options.socketFactory ?? ((url, socketOptions) => io(url, socketOptions));

  return {
    connect() {
      if (socket) return;

      socket = socketFactory(roommateSocketUrl(), {
        auth: { token: options.token },
        autoConnect: false,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 8
      });

      for (const eventName of EVENT_NAMES) {
        socket.on(eventName, (payload) => {
          const event = parseRoommateRealtimeEvent(eventName, payload);
          if (event) options.onEvent(event);
        });
      }
      socket.on("connect", () => {
        if (connectedBefore) options.onReconnect();
        connectedBefore = true;
      });
      socket.connect();
    },
    disconnect() {
      if (!socket) return;
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
  };
}

function roommateSocketUrl() {
  const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1").replace(/\/+$/, "");
  return `${apiBaseUrl.replace(/\/api\/v1$/, "")}/roommate-messaging`;
}

function parseRoommateRealtimeEvent(
  name: (typeof EVENT_NAMES)[number],
  payload: unknown
): RoommateRealtimeEvent | null {
  if (name === "roommate.message.created") {
    if (!isRecord(payload) || typeof payload.conversationId !== "string" || !isRoommateMessage(payload.message)) {
      return null;
    }
    if (payload.message.conversationId !== payload.conversationId) return null;
    return {
      name,
      payload: { conversationId: payload.conversationId, message: payload.message }
    };
  }

  if (name === "roommate.message.read") {
    if (!isRoommateReadState(payload)) return null;
    return { name, payload };
  }

  if (!isRecord(payload)) return null;
  if (payload.conversationId !== undefined && typeof payload.conversationId !== "string") return null;
  return {
    name,
    payload: payload.conversationId === undefined ? {} : { conversationId: payload.conversationId }
  };
}

function isRoommateMessage(value: unknown): value is ApiRoommateMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.conversationId === "string" &&
    (value.senderRole === "self" || value.senderRole === "peer") &&
    typeof value.clientMessageId === "string" &&
    typeof value.body === "string" &&
    typeof value.createdAt === "string"
  );
}

function isRoommateReadState(value: unknown): value is ApiRoommateConversationReadState {
  return (
    isRecord(value) &&
    typeof value.conversationId === "string" &&
    isReadCursor(value.self) &&
    isReadCursor(value.peer)
  );
}

function isReadCursor(value: unknown) {
  return (
    isRecord(value) &&
    isNullableString(value.lastReadMessageId) &&
    isNullableString(value.lastReadAt)
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
