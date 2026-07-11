export type RoommateDmMessage = {
  id: string;
  author: string;
  body: string;
  time: string;
  align: "left" | "right";
};

export type RoommateDmThread = {
  id: string;
  roommateId: string;
  roommateName: string;
  roommateRole: string;
  messages: RoommateDmMessage[];
  lastActivityAt: number;
};

export type StoredRoommateDmThread = {
  roommateId: string;
  messages: RoommateDmMessage[];
  lastActivityAt: number;
};

export type BuildRoommateDmThreadInput = {
  roommateId: string;
  roommateName: string;
  roommateRole: string;
  storedMessages?: RoommateDmMessage[];
  lastActivityAt?: number;
};

export function buildRoommateDmThread(input: BuildRoommateDmThreadInput): RoommateDmThread {
  return {
    id: `roommate-${input.roommateId}`,
    roommateId: input.roommateId,
    roommateName: input.roommateName,
    roommateRole: input.roommateRole,
    lastActivityAt: input.lastActivityAt ?? 0,
    messages:
      input.storedMessages && input.storedMessages.length > 0
        ? input.storedMessages
        : [
            {
              id: `roommate-${input.roommateId}-welcome`,
              author: input.roommateName,
              body: `Hey, our roommate fit looks strong. Want to compare budget, move-in timing, and lifestyle basics?`,
              time: "Now",
              align: "left"
            }
          ]
  };
}

export function buildStoredRoommateDmThread(input: BuildRoommateDmThreadInput): StoredRoommateDmThread {
  const thread = buildRoommateDmThread(input);

  return {
    roommateId: thread.roommateId,
    messages: thread.messages,
    lastActivityAt: thread.lastActivityAt
  };
}

export function appendRoommateDmMessage(
  thread: RoommateDmThread,
  input: { body: string; now?: Date }
): RoommateDmThread {
  const body = input.body.trim();
  if (!body) return thread;
  const now = input.now ?? new Date();

  return {
    ...thread,
    lastActivityAt: now.getTime(),
    messages: [
      ...thread.messages,
      {
        id: `${thread.id}-message-${thread.messages.length + 1}`,
        author: "You",
        body,
        time: formatMessageTime(now),
        align: "right"
      }
    ]
  };
}

export function getStoredRoommateDmThreads(storedThreads: unknown) {
  if (!Array.isArray(storedThreads)) return {};

  return Object.fromEntries(
    storedThreads.flatMap((thread) => {
      if (!isRecord(thread) || typeof thread.roommateId !== "string" || !thread.roommateId.trim()) return [];
      if (!Array.isArray(thread.messages)) return [];

      const messages = thread.messages.filter(isRoommateDmMessage);
      const lastActivityAt = typeof thread.lastActivityAt === "number" && Number.isFinite(thread.lastActivityAt)
        ? thread.lastActivityAt
        : 0;
      return [[thread.roommateId, { roommateId: thread.roommateId, messages, lastActivityAt } satisfies StoredRoommateDmThread]];
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRoommateDmMessage(value: unknown): value is RoommateDmMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    typeof value.time === "string" &&
    (value.align === "left" || value.align === "right")
  );
}

function formatMessageTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
