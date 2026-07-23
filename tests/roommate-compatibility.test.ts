import { describe, expect, it } from "vitest";

import {
  buildLocalRoommateDimensions,
  formatRoommateMatchType,
  getLocalRoommateCompatibilityScore,
  getLocalRoommateMatchType,
  getLocalRoommateRanking,
  getLocalRoommateRecommendation,
  getRoommatePresentationDimensions,
  roommateDimensionOrder
} from "../lib/roommate-compatibility";

describe("roommate compatibility presentation helpers", () => {
  it("keeps dimension labels ordered for card rendering", () => {
    expect(roommateDimensionOrder).toEqual(["budget", "lifestyle", "school", "area", "reliability", "profile"]);
    expect(formatRoommateMatchType("top-pick")).toBe("Top pick");
    expect(formatRoommateMatchType(undefined)).toBe("Explore");
  });

  it("builds local fallback dimensions compatible with the backend contract", () => {
    const dimensions = buildLocalRoommateDimensions({
      budget: 1650,
      match: 93,
      school: "UCLA",
      tags: ["早睡", "安静"],
      commute: "Westwood / Sawtelle"
    }, {
      budgetMin: 1200,
      budgetMax: 1800,
      hobbies: ["早睡", "安静"]
    });

    expect(dimensions).toMatchObject({
      profile: 93,
      budget: 96,
      lifestyle: 96,
      school: 95,
      area: 90,
      reliability: expect.any(Number)
    });
    expect(getLocalRoommateCompatibilityScore(dimensions)).toBeGreaterThanOrEqual(90);
    expect(getLocalRoommateMatchType(95, dimensions)).toBe("top-pick");
  });

  it("builds local ranking metadata aligned with recommendation behavior", () => {
    const dimensions = buildLocalRoommateDimensions({
      budget: 1650,
      match: 94,
      school: "UCLA",
      tags: ["早睡", "安静", "爱干净"],
      commute: "Westwood / Sawtelle"
    }, {
      budgetMin: 1200,
      budgetMax: 1800,
      hobbies: ["早睡", "安静"]
    });
    const score = getLocalRoommateCompatibilityScore(dimensions);
    const recommendation = getLocalRoommateRecommendation("top-pick", dimensions, ["早睡", "安静"]);
    const ranking = getLocalRoommateRanking(score, dimensions, recommendation, "balanced");

    expect(ranking).toMatchObject({
      strategy: "balanced",
      compatibilityScore: score,
      recommendationPriority: 0
    });
    expect(ranking.finalScore).toBeGreaterThanOrEqual(90);
  });

  it("falls back to preference-fit dimensions when backend metadata is missing", () => {
    expect(getRoommatePresentationDimensions({
      match: 82,
      preferenceFit: {
        score: 88,
        sharedHobbies: ["安静"],
        schoolMatches: ["UCLA"]
      }
    })).toEqual({
      profile: 82,
      budget: 88,
      lifestyle: 88,
      school: 92,
      area: 76,
      reliability: 85
    });
  });
});
