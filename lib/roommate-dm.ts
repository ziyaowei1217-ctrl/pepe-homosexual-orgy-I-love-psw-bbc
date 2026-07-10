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
};

export type StoredRoommateDmThread = {
  roommateId: string;
  messages: RoommateDmMessage[];
};

export type BuildRoommateDmThreadInput = {
  roommateId: string;
  roommateName: string;
  roommateRole: string;
  storedMessages?: RoommateDmMessage[];
};

export function buildRoommateDmThread(input: BuildRoommateDmThreadInput): RoommateDmThread {
  return {
    id: `roommate-${input.roommateId}`,
    roommateId: input.roommateId,
    roommateName: input.roommateName,
    roommateRole: input.roommateRole,
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
    messages: thread.messages
  };
}

export function appendRoommateDmMessage(
  thread: RoommateDmThread,
  input: { body: string; now?: Date }
): RoommateDmThread {
  const body = input.body.trim();
  if (!body) return thread;

  return {
    ...thread,
    messages: [
      ...thread.messages,
      {
        id: `${thread.id}-message-${thread.messages.length + 1}`,
        author: "You",
        body,
        time: formatMessageTime(input.now ?? new Date()),
        align: "right"
      }
    ]
  };
}

export function getStoredRoommateDmThreads(storedThreads: StoredRoommateDmThread[]) {
  return Object.fromEntries(
    storedThreads
      .filter((thread) => thread.roommateId)
      .map((thread) => [thread.roommateId, thread])
  );
}

function formatMessageTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
