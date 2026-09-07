import type { RoommateActionDtoValue } from "./dto";

export type RoommateDeckQuery = {
  limit?: number | string;
  cursor?: number | string;
  budgetMin?: number | string;
  budgetMax?: number | string;
  school?: string;
  schools?: string | string[];
  hobby?: string;
  hobbies?: string | string[];
  city?: string;
  gender?: string;
  strategy?: string;
};

export type RoommateDeckBaseProfile = {
  id?: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
};

export type RoommateCompatibilityDimensions = {
  budget: number;
  lifestyle: number;
  school: number;
  area: number;
  reliability: number;
  profile: number;
};

export type RoommateMatchType = "top-pick" | "strong-fit" | "explore" | "wildcard";

export type RoommateDeckStrategy = "precision" | "balanced" | "discovery";

export type RoommateRecommendation = {
  action: "like" | "later" | "pass";
  confidence: "high" | "medium" | "low";
  headline: string;
  primarySignals: string[];
  watchouts: string[];
  nextQuestions: string[];
};

export type RoommateRankingSignals = {
  finalScore: number;
  compatibilityScore: number;
  confidenceScore: number;
  profileQualityScore: number;
  diversityBoost: number;
  explorationBoost: number;
  recommendationPriority: number;
  percentile: number;
  strategy: RoommateDeckStrategy;
};

export type RoommateDeckCandidate = RoommateDeckBaseProfile & {
  actionTargetId?: string;
  compatibilityScore: number;
  ranking: RoommateRankingSignals;
  dimensions: RoommateCompatibilityDimensions;
  matchType: RoommateMatchType;
  recommendation: RoommateRecommendation;
  decisionHint: string;
  rank: number;
  deckBatch: string;
  spark: string;
  reasons: string[];
  tradeoffs: string[];
  icebreaker: string;
  badges: string[];
};

export type RoommateDeckResponse = {
  items: RoommateDeckCandidate[];
  pageInfo: {
    cursor: number;
    nextCursor: number | null;
    limit: number;
    returned: number;
    totalCandidates: number;
  };
  discovery: {
    headline: string;
    sampleSize: number;
    topScore: number;
    filters: {
      budgetMin: number;
      budgetMax: number;
      school: string;
      schools: string[];
      hobby: string;
      hobbies: string[];
      city: string;
      gender: string;
      strategy: RoommateDeckStrategy;
    };
    weights: Record<keyof RoommateCompatibilityDimensions, number>;
    rankingWeights: {
      compatibility: number;
      confidence: number;
      profileQuality: number;
      diversity: number;
      exploration: number;
    };
    tips: string[];
  };
};

export function toPublicRoommate<T extends object>(roommate: T): Omit<T, "ownerId" | "localReciprocalLike"> {
  const { ownerId: _ownerId, localReciprocalLike: _localReciprocalLike, ...publicRoommate } = roommate as T & {
    ownerId?: unknown;
    localReciprocalLike?: unknown;
  };
  return publicRoommate as Omit<T, "ownerId" | "localReciprocalLike">;
}

type RoommateDeckPreference = {
  budgetMin: number;
  budgetMax: number;
  school: string;
  schools: string[];
  hobby: string;
  hobbies: string[];
  city: string;
  gender: string;
  strategy: RoommateDeckStrategy;
};

const targetCatalogSize = 240;
const defaultLimit = 24;
const maxLimit = 80;
const defaultPreference = {
  budgetMin: 1200,
  budgetMax: 1900,
  school: "UCLA",
  schools: ["UCLA"],
  hobby: "早睡",
  hobbies: ["早睡"],
  city: "Los Angeles",
  gender: "Open",
  strategy: "balanced" as RoommateDeckStrategy
};

const dimensionWeights: Record<keyof RoommateCompatibilityDimensions, number> = {
  budget: 26,
  lifestyle: 22,
  school: 18,
  area: 10,
  reliability: 8,
  profile: 16
};

const schoolTracks = ["UCLA", "USC", "Caltech", "LMU", "ArtCenter", "Santa Monica College"];
const sparkLines = [
  "Great opener energy",
  "Easy co-living rhythm",
  "Budget-safe pick",
  "Commute twin",
  "Quiet-home signal",
  "High-trust profile",
  "Group-tour ready",
  "Lifestyle wildcard"
];

export function buildRoommateDeck(
  baseProfiles: RoommateDeckBaseProfile[],
  query: RoommateDeckQuery = {}
): RoommateDeckResponse {
  const limit = clampInteger(query.limit, defaultLimit, 1, maxLimit);
  const cursor = clampInteger(query.cursor, 0, 0, Number.MAX_SAFE_INTEGER);
  const preference = buildPreference(query);
  const realProfiles = baseProfiles.filter((profile) => "ownerId" in profile && Boolean(profile.ownerId));
  const developmentProfiles = baseProfiles.filter((profile) => !("ownerId" in profile) || !profile.ownerId);
  const catalog = [
    ...realProfiles.map((profile) => ({ ...profile, deckBatch: "owned" })),
    ...buildLargeRoommateCatalog(developmentProfiles, targetCatalogSize)
  ];
  const ranked = rankDeckCandidates(catalog.map((profile) => scoreDeckCandidate(profile, preference)), preference.strategy);
  const page = ranked.slice(cursor, cursor + limit);
  const nextCursor = cursor + page.length < ranked.length ? cursor + page.length : null;
  const topScore = ranked[0]?.compatibilityScore ?? 0;

  return {
    items: page,
    pageInfo: {
      cursor,
      nextCursor,
      limit,
      returned: page.length,
      totalCandidates: ranked.length
    },
    discovery: {
      headline: `Scanned ${ranked.length} roommate profiles and surfaced the strongest ${page.length}.`,
      sampleSize: ranked.length,
      topScore,
      filters: preference,
      weights: dimensionWeights,
      rankingWeights: getRankingWeights(preference.strategy),
      tips: [
        "Like high-confidence cards; use Later when one dimension needs a question.",
        "The engine blends fit quality, profile confidence, and controlled exploration so large decks stay useful.",
        "Broad school or hobby filters increase discovery; narrow filters produce precision-ranked top picks."
      ]
    }
  };
}

function buildPreference(query: RoommateDeckQuery): RoommateDeckPreference {
  const school = getQueryText(query.school, defaultPreference.school);
  const hobby = getQueryText(query.hobby, defaultPreference.hobby);
  const schools = getQueryList(query.schools, school ? [school] : []);
  const hobbies = getQueryList(query.hobbies, hobby ? [hobby] : []);

  return {
    budgetMin: coerceNumber(query.budgetMin, defaultPreference.budgetMin),
    budgetMax: coerceNumber(query.budgetMax, defaultPreference.budgetMax),
    school,
    schools,
    hobby,
    hobbies,
    city: getQueryText(query.city, defaultPreference.city),
    gender: getQueryText(query.gender, defaultPreference.gender),
    strategy: getDeckStrategy(query.strategy, schools, hobbies)
  };
}

export function getActionFeedback(action: RoommateActionDtoValue, roommateName: string) {
  if (action === "LIKE") {
    return {
      label: "Like sent",
      detail: `${roommateName} moved into your match lane. Mutual likes unlock DM and group planning.`
    };
  }

  if (action === "LATER") {
    return {
      label: "Saved for later",
      detail: `${roommateName} will stay out of your main deck while you compare stronger fits.`
    };
  }

  return {
    label: "Passed",
    detail: `${roommateName} is removed from this deck so the next candidate can surface.`
  };
}

export function buildLargeRoommateCatalog(
  baseProfiles: RoommateDeckBaseProfile[],
  targetSize = targetCatalogSize
) {
  if (baseProfiles.length === 0) return [];

  const variantsPerProfile = Math.max(1, Math.ceil(targetSize / baseProfiles.length));

  return baseProfiles
    .flatMap((profile, baseIndex) =>
      Array.from({ length: variantsPerProfile }, (_, variantIndex) =>
        buildVariantProfile(profile, baseIndex, variantIndex)
      )
    )
    .slice(0, targetSize);
}

function buildVariantProfile(
  profile: RoommateDeckBaseProfile,
  baseIndex: number,
  variantIndex: number
): RoommateDeckBaseProfile & { actionTargetId?: string; deckBatch: string } {
  if (variantIndex === 0) {
    return {
      ...profile,
      actionTargetId: profile.id,
      deckBatch: "seed"
    };
  }

  return {
    ...profile,
    id: `deck-${profile.id ?? `profile-${baseIndex}`}-${variantIndex}`,
    actionTargetId: profile.id,
    deckBatch: `explore-${variantIndex}`
  };
}

function scoreDeckCandidate(
  profile: RoommateDeckBaseProfile & { actionTargetId?: string; deckBatch: string },
  preference: RoommateDeckPreference
): RoommateDeckCandidate {
  const budget = getBudgetNumber(profile);
  const dimensions = buildCompatibilityDimensions(profile, budget, preference);
  const compatibilityScore = getWeightedCompatibilityScore(dimensions);
  const reasons = buildReasons(profile, budget, preference);
  const tradeoffs = buildTradeoffs(profile, budget, preference);
  const matchType = getMatchType(compatibilityScore, dimensions, tradeoffs);
  const recommendation = buildRecommendation(matchType, dimensions, compatibilityScore, reasons, tradeoffs);
  const confidenceScore = getConfidenceScore(profile, dimensions, reasons, tradeoffs);
  const profileQualityScore = getProfileQualityScore(profile, dimensions);

  return {
    ...toPublicRoommate(profile),
    compatibilityScore,
    ranking: {
      finalScore: compatibilityScore,
      compatibilityScore,
      confidenceScore,
      profileQualityScore,
      diversityBoost: 0,
      explorationBoost: 0,
      recommendationPriority: getRecommendationPriority(recommendation.action),
      percentile: 100,
      strategy: preference.strategy
    },
    dimensions,
    matchType,
    recommendation,
    decisionHint: recommendation.headline,
    rank: 0,
    spark: sparkLines[(compatibilityScore + profile.name.length) % sparkLines.length],
    reasons,
    tradeoffs,
    icebreaker: buildIcebreaker(profile, preference.hobbies),
    badges: buildBadges(profile, compatibilityScore, matchType)
  };
}

function rankDeckCandidates(candidates: RoommateDeckCandidate[], strategy: RoommateDeckStrategy) {
  const rankingWeights = getRankingWeights(strategy);
  const initialRanked = candidates
    .map((candidate) => ({
      ...candidate,
      ranking: {
        ...candidate.ranking,
        finalScore: getFinalRankingScore(candidate, rankingWeights, 0, 0)
      }
    }))
    .sort(compareRankedCandidates);
  const seenSchools = new Map<string, number>();
  const seenAreas = new Map<string, number>();
  const seenLifestyleTags = new Map<string, number>();
  const reranked = initialRanked.map((candidate, index) => {
    const diversityBoost = getDiversityBoost(candidate, seenSchools, seenAreas, seenLifestyleTags, strategy);
    const explorationBoost = getExplorationBoost(candidate, index, strategy);
    const finalScore = getFinalRankingScore(candidate, rankingWeights, diversityBoost, explorationBoost);

    incrementSeen(seenSchools, getPrimarySchool(candidate));
    incrementSeen(seenAreas, getPrimaryArea(candidate));
    incrementSeen(seenLifestyleTags, getPrimaryLifestyleTag(candidate));

    return {
      ...candidate,
      ranking: {
        ...candidate.ranking,
        finalScore,
        diversityBoost,
        explorationBoost
      }
    };
  });

  return reranked
    .sort(compareRankedCandidates)
    .map((candidate, index, rankedCandidates) => ({
      ...candidate,
      rank: index + 1,
      ranking: {
        ...candidate.ranking,
        percentile: Math.max(1, Math.round(((index + 1) / Math.max(1, rankedCandidates.length)) * 100))
      }
    }));
}

function compareRankedCandidates(first: RoommateDeckCandidate, second: RoommateDeckCandidate) {
  return (
    second.ranking.finalScore - first.ranking.finalScore ||
    first.ranking.recommendationPriority - second.ranking.recommendationPriority ||
    second.compatibilityScore - first.compatibilityScore ||
    first.tradeoffs.length - second.tradeoffs.length ||
    first.name.localeCompare(second.name)
  );
}

function getRankingWeights(strategy: RoommateDeckStrategy) {
  if (strategy === "precision") {
    return {
      compatibility: 0.78,
      confidence: 0.12,
      profileQuality: 0.08,
      diversity: 0.015,
      exploration: 0.005
    };
  }

  if (strategy === "discovery") {
    return {
      compatibility: 0.58,
      confidence: 0.14,
      profileQuality: 0.10,
      diversity: 0.11,
      exploration: 0.07
    };
  }

  return {
    compatibility: 0.68,
    confidence: 0.14,
    profileQuality: 0.10,
    diversity: 0.05,
    exploration: 0.03
  };
}

function getFinalRankingScore(
  candidate: RoommateDeckCandidate,
  weights: ReturnType<typeof getRankingWeights>,
  diversityBoost: number,
  explorationBoost: number
) {
  return clampDimension(
    candidate.compatibilityScore * weights.compatibility +
    candidate.ranking.confidenceScore * weights.confidence +
    candidate.ranking.profileQualityScore * weights.profileQuality +
    diversityBoost * weights.diversity +
    explorationBoost * weights.exploration
  );
}

function buildCompatibilityDimensions(
  profile: RoommateDeckBaseProfile,
  budget: number,
  preference: RoommateDeckPreference
): RoommateCompatibilityDimensions {
  return {
    budget: getBudgetDimension(budget, preference.budgetMin, preference.budgetMax),
    lifestyle: getLifestyleDimension(profile, preference.hobbies),
    school: getSchoolDimension(profile, preference.schools),
    area: getAreaDimension(profile, preference.city),
    reliability: getReliabilityDimension(profile),
    profile: clampDimension(profile.match)
  };
}

function getWeightedCompatibilityScore(dimensions: RoommateCompatibilityDimensions) {
  return clampScore(
    Object.entries(dimensionWeights).reduce((score, [dimension, weight]) =>
      score + dimensions[dimension as keyof RoommateCompatibilityDimensions] * (weight / 100), 0
    )
  );
}

function getBudgetDimension(budget: number, min: number, max: number) {
  if (budget <= 0) return 45;
  if (budget >= min && budget <= max) return 98;

  const distance = budget < min ? min - budget : budget - max;
  return Math.max(42, 92 - Math.round(distance / 8));
}

function getLifestyleDimension(profile: RoommateDeckBaseProfile, hobbies: string[]) {
  const normalizedTags = profile.tags.map(normalizeText);
  const hasCoreLivingSignal = normalizedTags.some((tag) =>
    ["quiet", "安静", "clean", "爱干净", "稳定", "early", "早睡"].some((signal) => tag.includes(signal))
  );
  const matches = hobbies.filter((hobby) => normalizedTags.includes(normalizeText(hobby))).length;

  if (hobbies.length === 0) return hasCoreLivingSignal ? 84 : 76;
  if (matches > 0) return clampDimension(68 + Math.round((matches / hobbies.length) * 30));
  return hasCoreLivingSignal ? 76 : 58;
}

function getSchoolDimension(profile: RoommateDeckBaseProfile, schools: string[]) {
  if (schools.length === 0) return 78;
  return schools.some((school) => includesNormalized(profile.role, school)) ? 96 : 58;
}

function getAreaDimension(profile: RoommateDeckBaseProfile, city: string) {
  if (!city) return 78;
  return includesNormalized(profile.commute, city) || includesNormalized(profile.role, city) ? 92 : 72;
}

function getReliabilityDimension(profile: RoommateDeckBaseProfile) {
  const normalizedTags = profile.tags.map(normalizeText);
  const signals = [
    ["稳定", "stable"],
    ["爱干净", "clean"],
    ["aa", "清楚"],
    ["不抽烟", "non-smoking"],
    ["学习友好", "study"],
    ["预算稳定", "budget"]
  ];
  const matchedSignals = signals.filter((signalGroup) =>
    signalGroup.some((signal) => normalizedTags.some((tag) => tag.includes(signal)))
  ).length;

  return clampDimension(70 + matchedSignals * 6 + (profile.match >= 90 ? 8 : 0));
}

function getConfidenceScore(
  profile: RoommateDeckBaseProfile,
  dimensions: RoommateCompatibilityDimensions,
  reasons: string[],
  tradeoffs: string[]
) {
  const completenessScore = [
    profile.name,
    profile.age,
    profile.role,
    profile.image,
    profile.budget,
    profile.commute,
    profile.tags.length >= 3
  ].filter(Boolean).length * 5;
  const dimensionFloor = Math.min(...Object.values(dimensions));
  const reasonBonus = Math.min(16, reasons.length * 4);
  const tradeoffPenalty = tradeoffs.length * 7;

  return clampDimension(44 + completenessScore + reasonBonus + Math.round(dimensionFloor * 0.18) - tradeoffPenalty);
}

function getProfileQualityScore(profile: RoommateDeckBaseProfile, dimensions: RoommateCompatibilityDimensions) {
  const tagDepthScore = Math.min(12, profile.tags.length * 2);
  const imageScore = profile.image.startsWith("http") ? 6 : 0;

  return clampDimension(profile.match * 0.68 + dimensions.reliability * 0.20 + tagDepthScore + imageScore);
}

function getDiversityBoost(
  candidate: RoommateDeckCandidate,
  seenSchools: Map<string, number>,
  seenAreas: Map<string, number>,
  seenLifestyleTags: Map<string, number>,
  strategy: RoommateDeckStrategy
) {
  if (strategy === "precision") return 0;

  const schoolRepeatPenalty = Math.min(24, (seenSchools.get(getPrimarySchool(candidate)) ?? 0) * 8);
  const areaRepeatPenalty = Math.min(18, (seenAreas.get(getPrimaryArea(candidate)) ?? 0) * 6);
  const lifestyleRepeatPenalty = Math.min(18, (seenLifestyleTags.get(getPrimaryLifestyleTag(candidate)) ?? 0) * 6);
  const explorationBase = strategy === "discovery" ? 88 : 72;

  return clampDimension(explorationBase - schoolRepeatPenalty - areaRepeatPenalty - lifestyleRepeatPenalty);
}

function getExplorationBoost(candidate: RoommateDeckCandidate, index: number, strategy: RoommateDeckStrategy) {
  if (strategy === "precision") return candidate.matchType === "top-pick" ? 8 : 0;

  const deterministicSeed = Array.from(candidate.name).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const cadenceBoost = (index + deterministicSeed) % (strategy === "discovery" ? 5 : 8) === 0 ? 90 : 40;
  const wildcardBoost = candidate.matchType === "wildcard" && candidate.compatibilityScore >= 76 ? 12 : 0;

  return clampDimension(cadenceBoost + wildcardBoost);
}

function incrementSeen(collection: Map<string, number>, key: string) {
  collection.set(key, (collection.get(key) ?? 0) + 1);
}

function getPrimarySchool(profile: Pick<RoommateDeckBaseProfile, "role">) {
  return schoolTracks.find((school) => includesNormalized(profile.role, school)) ?? "other";
}

function getPrimaryArea(profile: Pick<RoommateDeckBaseProfile, "commute">) {
  return normalizeText(profile.commute.split("/")[0] ?? profile.commute);
}

function getPrimaryLifestyleTag(profile: Pick<RoommateDeckBaseProfile, "tags">) {
  return normalizeText(profile.tags[0] ?? "general");
}

function getMatchType(
  compatibilityScore: number,
  dimensions: RoommateCompatibilityDimensions,
  tradeoffs: string[]
): RoommateMatchType {
  const lowestDimension = Math.min(...Object.values(dimensions));

  if (compatibilityScore >= 92 && tradeoffs.length === 0 && lowestDimension >= 76) return "top-pick";
  if (compatibilityScore >= 84 && tradeoffs.length <= 1) return "strong-fit";
  if (lowestDimension < 60 || tradeoffs.length >= 3) return "wildcard";
  return "explore";
}

function buildRecommendation(
  matchType: RoommateMatchType,
  dimensions: RoommateCompatibilityDimensions,
  compatibilityScore: number,
  reasons: string[],
  tradeoffs: string[]
): RoommateRecommendation {
  const weakestDimension = getWeakestDimension(dimensions);
  const topSignals = getTopDimensionLabels(dimensions, 2);

  if (matchType === "top-pick") {
    return {
      action: "like",
      confidence: "high",
      headline: "Recommended: Like — this is a high-confidence roommate fit.",
      primarySignals: topSignals,
      watchouts: tradeoffs,
      nextQuestions: ["Confirm move-in timing.", "Compare quiet hours and guest expectations."]
    };
  }

  if (matchType === "strong-fit") {
    return {
      action: "like",
      confidence: compatibilityScore >= 88 ? "high" : "medium",
      headline: "Recommended: Like if the profile feels socially comfortable.",
      primarySignals: topSignals,
      watchouts: tradeoffs,
      nextQuestions: [`Ask about ${weakestDimension}.`, "Confirm cleaning cadence."]
    };
  }

  if (matchType === "wildcard") {
    if (compatibilityScore < 84) {
      return {
        action: "pass",
        confidence: "medium",
        headline: "Recommended: Pass — core roommate fit is too weak for this preference set.",
        primarySignals: topSignals,
        watchouts: tradeoffs.length > 0 ? tradeoffs : [`Weakest dimension: ${weakestDimension}.`],
        nextQuestions: ["Skip unless a must-have detail is missing from the profile."]
      };
    }

    return {
      action: "later",
      confidence: "low",
      headline: "Recommended: Save for later — one key roommate variable is weak.",
      primarySignals: topSignals,
      watchouts: tradeoffs.length > 0 ? tradeoffs : [`Weakest dimension: ${weakestDimension}.`],
      nextQuestions: [`Clarify ${weakestDimension}.`, "Only like if their living style is flexible."]
    };
  }

  return {
    action: "later",
    confidence: "medium",
    headline: "Recommended: Compare before liking.",
    primarySignals: topSignals,
    watchouts: tradeoffs,
    nextQuestions: [`Ask about ${weakestDimension}.`, "Check whether budget and routine expectations match."]
  };
}

function getWeakestDimension(dimensions: RoommateCompatibilityDimensions) {
  return getDimensionLabel(getSortedDimensions(dimensions).at(-1)?.[0] ?? "profile");
}

function getTopDimensionLabels(dimensions: RoommateCompatibilityDimensions, count: number) {
  return getSortedDimensions(dimensions).slice(0, count).map(([dimension]) => getDimensionLabel(dimension));
}

function getSortedDimensions(dimensions: RoommateCompatibilityDimensions): Array<[keyof RoommateCompatibilityDimensions, number]> {
  return (Object.entries(dimensions) as Array<[keyof RoommateCompatibilityDimensions, number]>)
    .sort((first, second) => second[1] - first[1]);
}

function getDimensionLabel(dimension: keyof RoommateCompatibilityDimensions) {
  const labels: Record<keyof RoommateCompatibilityDimensions, string> = {
    profile: "overall profile quality",
    budget: "budget alignment",
    lifestyle: "living rhythm",
    school: "school/work lane",
    area: "area fit",
    reliability: "reliability signals"
  };

  return labels[dimension];
}

function buildReasons(
  profile: RoommateDeckBaseProfile,
  budget: number,
  preference: RoommateDeckPreference
) {
  const reasons: string[] = [];
  const matchedSchools = preference.schools.filter((school) => includesNormalized(profile.role, school));
  const matchedHobbies = preference.hobbies.filter((hobby) =>
    profile.tags.some((tag) => normalizeText(tag) === normalizeText(hobby))
  );

  if (budget >= preference.budgetMin && budget <= preference.budgetMax) {
    reasons.push(`预算匹配：$${budget.toLocaleString()}`);
  }
  if (matchedSchools.length > 0) {
    reasons.push(`学校或职业方向匹配：${matchedSchools.join(" / ")}`);
  }
  if (matchedHobbies.length > 0) {
    reasons.push(`共同生活习惯：${matchedHobbies.slice(0, 2).join(" + ")}`);
  }
  if (profile.match >= 90) {
    reasons.push("基础匹配度较高");
  }
  if (profile.tags.some((tag) => tag.includes("安静") || tag.toLowerCase().includes("quiet"))) {
    reasons.push("偏好安静居住环境");
  }

  return reasons.length > 0 ? reasons.slice(0, 4) : ["资料有一定重合，建议进一步了解"];
}

function buildTradeoffs(
  profile: RoommateDeckBaseProfile,
  budget: number,
  preference: RoommateDeckPreference
) {
  const tradeoffs: string[] = [];
  const hasSchoolMatch = preference.schools.some((school) => includesNormalized(profile.role, school));
  const hasHobbyMatch = preference.hobbies.some((hobby) =>
    profile.tags.some((tag) => normalizeText(tag) === normalizeText(hobby))
  );

  if (budget < preference.budgetMin) tradeoffs.push("Budget is below your range; check expectations.");
  if (budget > preference.budgetMax) tradeoffs.push("Budget is above your range.");
  if (preference.schools.length > 0 && !hasSchoolMatch) tradeoffs.push("Different school/work lane.");
  if (preference.hobbies.length > 0 && !hasHobbyMatch) {
    tradeoffs.push("Favorite habit not confirmed yet.");
  }

  return tradeoffs.slice(0, 3);
}

function buildIcebreaker(profile: RoommateDeckBaseProfile, hobbies: string[]) {
  const tag = hobbies.length > 0
    ? profile.tags.find((item) => hobbies.some((hobby) => normalizeText(item) === normalizeText(hobby))) ?? profile.tags[0] ?? "your routine"
    : profile.tags[0] ?? "your routine";
  return `Ask ${profile.name.split(" ")[0]} about ${tag} and ideal quiet hours.`;
}

function buildBadges(profile: RoommateDeckBaseProfile, compatibilityScore: number, matchType: RoommateMatchType) {
  const badges = [formatMatchType(matchType)];
  if (profile.tags.some((tag) => tag.includes("安静") || tag.toLowerCase().includes("quiet"))) badges.push("Quiet");
  if (profile.tags.some((tag) => tag.includes("健身"))) badges.push("Gym");
  if (profile.tags.some((tag) => tag.includes("猫") || tag.includes("宠物"))) badges.push("Pet-aware");
  if (compatibilityScore >= 88) badges.push("High confidence");
  return badges.slice(0, 4);
}

function formatMatchType(matchType: RoommateMatchType) {
  if (matchType === "top-pick") return "Top pick";
  if (matchType === "strong-fit") return "Strong fit";
  if (matchType === "wildcard") return "Wildcard";
  return "Explore";
}

function getRecommendationPriority(action: RoommateRecommendation["action"]) {
  if (action === "like") return 0;
  if (action === "later") return 1;
  return 2;
}

function getBudgetNumber(roommate: Pick<RoommateDeckBaseProfile, "budget">) {
  const parsed = Number(roommate.budget.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampInteger(value: number | string | undefined, fallback: number, min: number, max: number) {
  const parsed = coerceNumber(value, fallback);
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function coerceNumber(value: number | string | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampScore(value: number) {
  return Math.max(50, Math.min(99, Math.round(value)));
}

function clampDimension(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeQueryText(value: string | undefined) {
  return value?.trim() ?? "";
}

function getQueryText(value: string | undefined, fallback: string) {
  return value === undefined ? fallback : normalizeQueryText(value);
}

function getQueryList(value: string | string[] | undefined, fallback: string[]) {
  if (value === undefined) return fallback;
  const rawValues = Array.isArray(value) ? value : value.split(",");

  return Array.from(new Set(rawValues.map(normalizeQueryText).filter(Boolean)));
}

function getDeckStrategy(value: string | undefined, schools: string[], hobbies: string[]): RoommateDeckStrategy {
  if (value === "precision" || value === "balanced" || value === "discovery") return value;
  if (schools.length === 0 && hobbies.length === 0) return "discovery";
  if (schools.length <= 1 && hobbies.length <= 1) return "precision";
  return defaultPreference.strategy;
}

function includesNormalized(value: string, search: string) {
  if (!search) return false;
  return normalizeText(value).includes(normalizeText(search));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}
