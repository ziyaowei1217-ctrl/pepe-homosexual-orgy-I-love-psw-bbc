import { describe, expect, it } from "vitest";

import { classifyRoommateQueue } from "../lib/roommate-queue";

const candidates = [{ id: "mia" }, { id: "grace" }, { id: "ethan" }];

describe("roommate queue", () => {
  it("places every candidate in at most one workflow column", () => {
    const result = classifyRoommateQueue(candidates, (item) => item.id, {
      likedByMeIds: ["mia", "grace", "ethan"],
      likedMeIds: ["mia", "grace"],
      roommateIds: ["mia"]
    });

    expect(result.waiting.map((item) => item.id)).toEqual(["ethan"]);
    expect(result.mutual.map((item) => item.id)).toEqual(["grace"]);
    expect(result.roommates.map((item) => item.id)).toEqual(["mia"]);
  });
});
