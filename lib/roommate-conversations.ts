import type {
  ApiRoommateConversation,
  ApiRoommateConversationReadState,
  ApiRoommateMessage
} from "./api";

export type RoommateMessageView = ApiRoommateMessage & {
  deliveryStatus: "sending" | "sent" | "failed";
};

export type RoommateConversationTarget = {
  conversationId?: string | null;
  peerProfileId?: string | null;
};

type OptimisticRoommateMessageInput = {
  conversationId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
};

type ReadGateInput = {
  activeConversationId: string | null;
  conversationId: string;
  documentVisible: boolean;
  lastPeerMessageId: string | null;
  lastReadMessageId: string | null;
  pendingMessageId: string | null;
};

export function createOptimisticRoommateMessage(input: OptimisticRoommateMessageInput): RoommateMessageView {
  return {
    id: `optimistic:${input.clientMessageId}`,
    conversationId: input.conversationId,
    senderRole: "self",
    clientMessageId: input.clientMessageId,
    body: input.body.trim(),
    createdAt: input.createdAt,
    deliveryStatus: "sending"
  };
}

export function mergeRoommateMessages(
  current: readonly (ApiRoommateMessage | RoommateMessageView)[],
  incoming: readonly (ApiRoommateMessage | RoommateMessageView)[]
): RoommateMessageView[] {
  const merged: RoommateMessageView[] = [];

  for (const candidate of [...current, ...incoming]) {
    const message = normalizeMessage(candidate);
    const existingIndex = merged.findIndex((existing) => messagesMatch(existing, message));
    if (existingIndex === -1) {
      merged.push(message);
      continue;
    }

    merged[existingIndex] = preferredMessage(merged[existingIndex], message);
  }

  return merged.sort(compareMessages);
}

export function reconcileRoommateMessage(
  messages: readonly RoommateMessageView[],
  committed: ApiRoommateMessage
) {
  return mergeRoommateMessages(messages, [committed]);
}

export function markRoommateMessageFailed(
  messages: readonly RoommateMessageView[],
  clientMessageId: string
): RoommateMessageView[] {
  return messages.map((message) =>
    message.senderRole === "self" &&
    message.clientMessageId === clientMessageId &&
    message.deliveryStatus === "sending"
      ? { ...message, deliveryStatus: "failed" }
      : message
  );
}

export function mergeRoommateMessageIntoConversations(
  conversations: readonly ApiRoommateConversation[],
  message: ApiRoommateMessage
): ApiRoommateConversation[] {
  return conversations
    .map((conversation) => {
      if (conversation.id !== message.conversationId) return conversation;

      const latest = conversation.latestMessage;
      if (latest && compareMessages(latest, message) > 0) return conversation;

      const duplicate = latest ? messagesMatch(latest, message) : false;
      return {
        ...conversation,
        latestMessage: message,
        unreadCount: conversation.unreadCount + (!duplicate && message.senderRole === "peer" ? 1 : 0),
        lastMessageAt: message.createdAt
      };
    })
    .sort(compareConversations);
}

export function applyRoommateReadState(
  conversations: readonly ApiRoommateConversation[],
  state: ApiRoommateConversationReadState
): ApiRoommateConversation[] {
  return conversations.map((conversation) => {
    if (conversation.id !== state.conversationId) return conversation;

    const selfAdvanced = cursorAdvanced(
      conversation.lastReadMessageId,
      conversation.lastReadAt,
      state.self.lastReadMessageId,
      state.self.lastReadAt
    );
    const peerAdvanced = cursorAdvanced(
      conversation.peerLastReadMessageId,
      conversation.peerLastReadAt,
      state.peer.lastReadMessageId,
      state.peer.lastReadAt
    );
    if (!selfAdvanced && !peerAdvanced) return conversation;

    return {
      ...conversation,
      ...(selfAdvanced
        ? {
            lastReadMessageId: state.self.lastReadMessageId,
            lastReadAt: state.self.lastReadAt,
            unreadCount: 0
          }
        : {}),
      ...(peerAdvanced
        ? {
            peerLastReadMessageId: state.peer.lastReadMessageId,
            peerLastReadAt: state.peer.lastReadAt
          }
        : {})
    };
  });
}

export function getRoommateUnreadTotal(conversations: readonly ApiRoommateConversation[]) {
  return conversations.reduce(
    (total, conversation) => total + Math.max(0, Number.isFinite(conversation.unreadCount) ? conversation.unreadCount : 0),
    0
  );
}

export function resolveRoommateConversationTarget(
  conversations: readonly ApiRoommateConversation[],
  target: RoommateConversationTarget
) {
  if (target.conversationId) {
    return conversations.find((conversation) => conversation.id === target.conversationId) ?? null;
  }
  if (target.peerProfileId) {
    return conversations.find((conversation) => conversation.peer.id === target.peerProfileId) ?? null;
  }
  return null;
}

export function shouldReportRoommateRead(input: ReadGateInput) {
  return Boolean(
    input.documentVisible &&
      input.activeConversationId === input.conversationId &&
      input.lastPeerMessageId &&
      input.lastPeerMessageId !== input.lastReadMessageId &&
      input.pendingMessageId === null
  );
}

function normalizeMessage(message: ApiRoommateMessage | RoommateMessageView): RoommateMessageView {
  return "deliveryStatus" in message ? { ...message } : { ...message, deliveryStatus: "sent" };
}

function messagesMatch(left: ApiRoommateMessage, right: ApiRoommateMessage) {
  if (left.id === right.id) return true;
  return (
    left.senderRole === "self" &&
    right.senderRole === "self" &&
    left.clientMessageId === right.clientMessageId
  );
}

function preferredMessage(left: RoommateMessageView, right: RoommateMessageView) {
  const leftCommitted = !left.id.startsWith("optimistic:");
  const rightCommitted = !right.id.startsWith("optimistic:");
  if (leftCommitted !== rightCommitted) return rightCommitted ? right : left;
  if (left.deliveryStatus === "sent" && right.deliveryStatus !== "sent") return left;
  return right;
}

function compareMessages(left: ApiRoommateMessage, right: ApiRoommateMessage) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
}

function compareConversations(left: ApiRoommateConversation, right: ApiRoommateConversation) {
  const leftActivity = left.lastMessageAt ?? left.updatedAt;
  const rightActivity = right.lastMessageAt ?? right.updatedAt;
  return rightActivity.localeCompare(leftActivity) || right.id.localeCompare(left.id);
}

function cursorAdvanced(
  currentId: string | null,
  currentAt: string | null,
  nextId: string | null,
  nextAt: string | null
) {
  if (!nextId || !nextAt) return false;
  if (!currentId || !currentAt) return true;
  return nextAt > currentAt || (nextAt === currentAt && nextId > currentId);
}
