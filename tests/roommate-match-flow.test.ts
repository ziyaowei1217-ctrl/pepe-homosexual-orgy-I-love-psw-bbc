import { describe, expect, it } from "vitest";

import {
  getRoommateConnectionStatus
} from "../lib/roommate-match-flow";

describe("roommate match flow", () => {
  it("keeps one-sided likes distinct from a backend-confirmed mutual match", () => {
    const state = {
      likedByMeIds: new Set(["mia"]),
      likedMeIds: new Set<string>(),
      introSentIds: new Set<string>(),
      roommateIds: new Set<string>()
    };

    expect(getRoommateConnectionStatus("mia", state)).toBe("liked-by-me");
  });

  it("represents mutual and roommate states returned by the backend", () => {
    const mutualState = {
      likedByMeIds: ["mia"],
      likedMeIds: ["mia"],
      introSentIds: [],
      roommateIds: []
    };

    expect(getRoommateConnectionStatus("mia", mutualState)).toBe("mutual");

    const roommateState = {
      ...mutualState,
      roommateIds: ["mia"]
    };

    expect(getRoommateConnectionStatus("mia", roommateState)).toBe("roommate");
  });

  it("keeps legacy intro state informational without enabling a local workflow", () => {
    const state = {
      likedByMeIds: [],
      likedMeIds: ["mia"],
      introSentIds: ["mia"],
      roommateIds: []
    };

    expect(getRoommateConnectionStatus("mia", state)).toBe("intro-sent");
  });
});
