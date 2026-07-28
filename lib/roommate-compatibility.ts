import type {
  ApiRoommateCompatibilityDimensions,
  ApiRoommateDeckStrategy,
  ApiRoommateMatchType,
  ApiRoommateRankingSignals,
  ApiRoommateRecommendation
} from "@/lib/api";
import type { RoommatePreference, RoommatePreferenceFit } from "@/lib/roommate-preferences";

export const roommateDimensionOrder: Array<keyof ApiRoommateCompatibilityDimensions> = [
  "budget",
  "lifestyle",
  "school",
  "area",
  "reliability",
  "profile"
];

export const roommateDimensionLabels: Record<keyof ApiRoommateCompatibilityDimensions, string> = {
  profile: "Profile",
  budget: "Budget",
  lifestyle: "Lifestyle",
  school: "School",
  area: "Area",
  reliability: "Trust"
};

export const roommateDimensionWeights: Record<keyof ApiRoommateCompatibilityDimensions, number> = {
  budget: 26,
  lifestyle: 22,
  school: 18,
  area: 10,
  reliability: 8,
  profile: 16
};

export function formatRoommateMatchType(matchType: ApiRoommateMatchType | undefined) {
  if (matchType === "top-pick") return "Top pick";
  if (matchType === "strong-fit") return "Strong fit";
  if (matchType === "wildcard") return "Wildcard";
  return "Explore";
}

export function getRoommatePresentationDimensions(roommate: {
  dimensions?: ApiRoommateCompatibilityDimensions;
  match: number;
  preferenceFit: Pick<RoommatePreferenceFit, "score" | "sharedHobbies" | "schoolMatches">;
}): ApiRoommateCompatibilityDimensions {
  if (roommate.dimensions) return roommate.dimensions;

  const fallbackScore = roommate.preferenceFit.score;
  return {
    profile: roommate.match,
    budget: fallbackScore,
    lifestyle: Math.max(fallbackScore, roommate.preferenceFit.sharedHobbies.length > 0 ? 86 : 70),
    school: roommate.preferenceFit.schoolMatches.length > 0 ? 92 : 68,
    area: 76,
    reliability: Math.max(72, Math.round((fallbackScore + roommate.match) / 2))
  };
}

export function buildLocalRoommateDimensions(
  {
    budget,
    match,
    school,
    tags,
    commute
  }: {
    budget: number;
    match: number;
    school: string;
    tags: string[];
    commute: string;
  },
  preference: Pick<RoommatePreference, "budgetMin" | "budgetMax" | "hobbies">
): ApiRoommateCompatibilityDimensions {
  const budgetInDefaultRange = budget >= preference.budgetMin && budget <= preference.budgetMax;
  const lifestyleOverlap = preference.hobbies.filter((hobby) => tags.includes(hobby)).length;
  const normalizedCommute = commute.toLowerCase();
  const campusArea =
    normalizedCommute.includes("westwood") ||
    normalizedCommute.includes("sawtelle") ||
    normalizedCommute.includes("culver");

  return {
    profile: match,
    budget: budgetInDefaultRange ? 96 : Math.max(54, 88 - Math.round(Math.abs(budget - 1500) / 18)),
    lifestyle: lifestyleOverlap > 1 ? 96 : lifestyleOverlap === 1 ? 86 : 70,
    school: school === "UCLA" ? 95 : school === "Other" ? 68 : 76,
    area: campusArea ? 90 : 74,
    reliability: getLocalReliabilityScore(tags, match)
  };
}

export function getLocalRoommateMatchType(
  score: number,
  dimensions: ApiRoommateCompatibilityDimensions
): ApiRoommateMatchType {
  const lowestDimension = Math.min(...Object.values(dimensions));

  if (score >= 92 && lowestDimension >= 76) return "top-pick";
  if (score >= 84) return "strong-fit";
  if (lowestDimension < 62) return "wildcard";
  return "explore";
}

export function getLocalRoommateCompatibilityScore(dimensions: ApiRoommateCompatibilityDimensions) {
  const weightedScore = Object.entries(roommateDimensionWeights).reduce((score, [dimension, weight]) =>
    score + dimensions[dimension as keyof ApiRoommateCompatibilityDimensions] * (weight / 100), 0
  );

  return Math.max(50, Math.min(99, Math.round(weightedScore)));
}

export function getLocalRoommateDecisionHint(matchType: ApiRoommateMatchType, tags: string[]) {
  if (matchType === "top-pick") return "Swipe right: budget, rhythm, and location all look unusually clean.";
  if (matchType === "strong-fit") return `Like if ${tags[0] ?? "their routine"} is a must-have for your apartment.`;
  if (matchType === "wildcard") return "Use Later unless the profile feels worth one more comparison.";
  return "Explore this card: strong enough to compare, not automatic enough to rush.";
}

export function getLocalRoommateRecommendation(
  matchType: ApiRoommateMatchType,
  dimensions: ApiRoommateCompatibilityDimensions,
  tags: string[]
): ApiRoommateRecommendation {
  const topSignal = getTopLocalSignal(dimensions);

  if (matchType === "top-pick") {
    return {
      action: "like",
      confidence: "high",
      headline: "Recommended: Like — this is a high-confidence roommate fit.",
      primarySignals: [topSignal, tags[0] ?? "living rhythm"],
      watchouts: [],
      nextQuestions: ["Confirm move-in timing.", "Compare quiet hours and guest expectations."]
    };
  }

  if (matchType === "strong-fit") {
    return {
      action: "like",
      confidence: "medium",
      headline: "Recommended: Like if the profile feels socially comfortable.",
      primarySignals: [topSignal, tags[0] ?? "living rhythm"],
      watchouts: [],
      nextQuestions: ["Confirm cleaning cadence.", "Ask about guest expectations."]
    };
  }

  if (matchType === "wildcard" && Math.min(...Object.values(dimensions)) < 58) {
    return {
      action: "pass",
      confidence: "medium",
      headline: "Recommended: Pass — core roommate fit is too weak for this preference set.",
      primarySignals: [topSignal],
      watchouts: ["A key roommate variable is too far from your settings."],
      nextQuestions: ["Skip unless the profile is missing important details."]
    };
  }

  return {
    action: "later",
    confidence: matchType === "wildcard" ? "low" : "medium",
    headline: matchType === "wildcard"
      ? "Recommended: Save for later — one key roommate variable is weak."
      : "Recommended: Compare before liking.",
    primarySignals: [topSignal],
    watchouts: ["Needs one more roommate-basics check."],
    nextQuestions: ["Ask about routine, guests, and cleaning.", "Only like if the lifestyle feels flexible."]
  };
}

export function getLocalRoommateRanking(
  compatibilityScore: number,
  dimensions: ApiRoommateCompatibilityDimensions,
  recommendation: ApiRoommateRecommendation,
  strategy: ApiRoommateDeckStrategy = "balanced"
): ApiRoommateRankingSignals {
  const confidenceScore = Math.min(99, Math.max(50, Math.round(
    compatibilityScore * 0.68 + Math.min(...Object.values(dimensions)) * 0.22 + dimensions.reliability * 0.10
  )));
  const profileQualityScore = Math.min(99, Math.max(50, Math.round(
    dimensions.profile * 0.72 + dimensions.reliability * 0.20 + 7
  )));
  const diversityBoost = strategy === "precision" ? 0 : 72;
  const explorationBoost = strategy === "discovery" ? 78 : strategy === "balanced" ? 42 : 8;
  const finalScore = Math.min(99, Math.max(50, Math.round(
    compatibilityScore * 0.68 + confidenceScore * 0.14 + profileQualityScore * 0.10 + diversityBoost * 0.05 + explorationBoost * 0.03
  )));

  return {
    finalScore,
    compatibilityScore,
    confidenceScore,
    profileQualityScore,
    diversityBoost,
    explorationBoost,
    recommendationPriority: recommendation.action === "like" ? 0 : recommendation.action === "later" ? 1 : 2,
    percentile: 100,
    strategy
  };
}

function getLocalReliabilityScore(tags: string[], match: number) {
  const normalizedTags = tags.map((tag) => tag.toLowerCase());
  const reliabilitySignals = ["稳定", "爱干净", "aa", "不抽烟", "学习友好", "预算稳定"];
  const matchedSignals = reliabilitySignals.filter((signal) => normalizedTags.some((tag) => tag.includes(signal))).length;

  return Math.min(100, 70 + matchedSignals * 6 + (match >= 90 ? 8 : 0));
}

function getTopLocalSignal(dimensions: ApiRoommateCompatibilityDimensions) {
  const [dimension] = (Object.entries(dimensions) as Array<[keyof ApiRoommateCompatibilityDimensions, number]>)
    .sort((first, second) => second[1] - first[1])[0];

  return roommateDimensionLabels[dimension];
}
