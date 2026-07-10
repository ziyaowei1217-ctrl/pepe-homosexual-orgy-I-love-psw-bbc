import { describe, expect, it } from "vitest";

import {
  canOpenRoommateDm,
  canRequestRoommateGroupTour,
  canSendRoommateIntro,
  getAccessibleRoommateDmId,
  getRoommateMatchStateAfterLike,
  getRoommateConnectionStatus
} from "../lib/roommate-match-flow";

describe("roommate match flow", () => {
  it("does not let a URL unlock a candidate who only liked me", () => {
    const oneSidedState = {
      likedByMeIds: [],
      likedMeIds: ["grace"],
      introSentIds: [],
      roommateIds: []
    };

    expect(getAccessibleRoommateDmId("grace", oneSidedState)).toBeNull();
    expect(getAccessibleRoommateDmId("grace", { ...oneSidedState, likedByMeIds: ["grace"] })).toBe("grace");
  });

  it("builds the persisted match state before navigating to a mutual DM", () => {
    expect(
      getRoommateMatchStateAfterLike("mia", {
        likedByMeIds: ["grace"],
        introSentIds: ["mia"],
        roommateIds: []
      })
    ).toEqual({
      likedByMeIds: ["grace", "mia"],
      introSentIds: ["mia"],
      roommateMemberIds: []
    });
  });

  it("keeps one-sided likes from unlocking private DM or group tours", () => {
    const state = {
      likedByMeIds: new Set(["mia"]),
      likedMeIds: new Set<string>(),
      introSentIds: new Set<string>(),
      roommateIds: new Set<string>()
    };

    expect(getRoommateConnectionStatus("mia", state)).toBe("liked-by-me");
    expect(canSendRoommateIntro("mia", state)).toBe(true);
    expect(canOpenRoommateDm("mia", state)).toBe(false);
    expect(canRequestRoommateGroupTour("mia", state)).toBe(false);
  });

  it("unlocks private DM only after mutual like, then group tour only after deciding as roommates", () => {
    const mutualState = {
      likedByMeIds: ["mia"],
      likedMeIds: ["mia"],
      introSentIds: [],
      roommateIds: []
    };

    expect(getRoommateConnectionStatus("mia", mutualState)).toBe("mutual");
    expect(canSendRoommateIntro("mia", mutualState)).toBe(false);
    expect(canOpenRoommateDm("mia", mutualState)).toBe(true);
    expect(canRequestRoommateGroupTour("mia", mutualState)).toBe(false);

    const roommateState = {
      ...mutualState,
      roommateIds: ["mia"]
    };

    expect(getRoommateConnectionStatus("mia", roommateState)).toBe("roommate");
    expect(canOpenRoommateDm("mia", roommateState)).toBe(true);
    expect(canRequestRoommateGroupTour("mia", roommateState)).toBe(true);
  });

  it("limits non-mutual candidates to one opening message", () => {
    const state = {
      likedByMeIds: [],
      likedMeIds: ["mia"],
      introSentIds: ["mia"],
      roommateIds: []
    };

    expect(getRoommateConnectionStatus("mia", state)).toBe("intro-sent");
    expect(canSendRoommateIntro("mia", state)).toBe(false);
    expect(canOpenRoommateDm("mia", state)).toBe(false);
    expect(canRequestRoommateGroupTour("mia", state)).toBe(false);
  });
});
