import { describe, expect, it } from "vitest";

import {
  appendRoommateDmMessage,
  buildStoredRoommateDmThread,
  buildRoommateDmThread,
  getStoredRoommateDmThreads,
  type StoredRoommateDmThread
} from "../lib/roommate-dm";

describe("roommate dm", () => {
  it("builds a roommate-only thread without listing context", () => {
    const thread = buildRoommateDmThread({
      roommateId: "Mia Chen",
      roommateName: "Mia Chen",
      roommateRole: "UCLA MSBA"
    });

    expect(thread.id).toBe("roommate-Mia Chen");
    expect(thread.roommateName).toBe("Mia Chen");
    expect(thread.messages[0].body).toContain("roommate fit");
    expect(thread.messages[0].body).not.toContain("房东");
    expect(thread.messages[0].body).not.toContain("看房");
  });

  it("appends trimmed outgoing messages and ignores empty drafts", () => {
    const thread = buildRoommateDmThread({
      roommateId: "Mia Chen",
      roommateName: "Mia Chen",
      roommateRole: "UCLA MSBA"
    });
    const sent = appendRoommateDmMessage(thread, {
      body: "  我们可以聊一下预算吗？  ",
      now: new Date("2026-07-10T08:00:00.000Z")
    });
    const unchanged = appendRoommateDmMessage(sent, { body: "   " });

    expect(sent.messages).toHaveLength(thread.messages.length + 1);
    expect(sent.messages.at(-1)).toMatchObject({
      author: "You",
      body: "我们可以聊一下预算吗？",
      align: "right"
    });
    expect(unchanged.messages).toHaveLength(sent.messages.length);
  });

  it("hydrates stored roommate dm threads by id", () => {
    const stored: StoredRoommateDmThread[] = [
      {
        roommateId: "Mia Chen",
        messages: [
          {
            id: "stored-1",
            author: "You",
            body: "Budget works for me",
            time: "9:00 AM",
            align: "right"
          }
        ]
      }
    ];

    expect(getStoredRoommateDmThreads(stored)["Mia Chen"].messages[0].body).toBe("Budget works for me");
  });

  it("builds a stored thread with default messages when no history exists", () => {
    const stored = buildStoredRoommateDmThread({
      roommateId: "Mia Chen",
      roommateName: "Mia Chen",
      roommateRole: "UCLA MSBA"
    });

    expect(stored.roommateId).toBe("Mia Chen");
    expect(stored.messages[0]).toMatchObject({
      author: "Mia Chen",
      align: "left"
    });
  });
});
