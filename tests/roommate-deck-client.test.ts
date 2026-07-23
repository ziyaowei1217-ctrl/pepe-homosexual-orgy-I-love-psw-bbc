import { describe, expect, it } from "vitest";

import {
  buildRoommateDeckApiPath,
  getRoommateActionTargetId,
  getRoommateDisplayScore,
  hydrateRoommateDeck,
  mergeUniqueText
} from "../lib/roommate-deck-client";

describe("roommate deck client helpers", () => {
  it("builds backend deck URLs from preferences", () => {
    expect(
      buildRoommateDeckApiPath({
        gender: "Open",
        budgetMin: 1200,
        budgetMax: 1800,
        schools: ["UCLA"],
        hobbies: ["早睡"]
      }, 80)
    ).toBe("/roommates/deck?limit=80&cursor=80&budgetMin=1200&budgetMax=1800&school=UCLA&schools=UCLA&hobby=%E6%97%A9%E7%9D%A1&hobbies=%E6%97%A9%E7%9D%A1&gender=Open");
  });

  it("hydrates a deck without duplicating fallback candidates", () => {
    const hydrated = hydrateRoommateDeck(
      [{ name: "Mia" }],
      [{ name: "Mia" }, { name: "Olivia" }, { name: "Noah" }],
      (roommate) => roommate.name,
      2
    );

    expect(hydrated).toEqual([{ name: "Mia" }, { name: "Olivia" }]);
  });

  it("keeps action targets and display scores deterministic", () => {
    expect(getRoommateActionTargetId({ id: "synthetic", actionTargetId: "seed" })).toBe("seed");
    expect(getRoommateActionTargetId({ id: "seed" })).toBe("seed");
    expect(getRoommateDisplayScore({ match: 80, compatibilityScore: 92 })).toBe(92);
    expect(getRoommateDisplayScore({
      match: 80,
      compatibilityScore: 88,
      preferenceFit: {
        score: 94,
        reasons: [],
        gaps: [],
        sharedHobbies: [],
        schoolMatches: []
      }
    })).toBe(94);
  });

  it("merges unique text while preserving first-seen order", () => {
    expect(mergeUniqueText(["Budget fit", "Quiet"], ["Quiet", "UCLA"])).toEqual(["Budget fit", "Quiet", "UCLA"]);
  });
});
