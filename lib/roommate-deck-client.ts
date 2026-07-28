import type { RoommatePreference } from "@/lib/roommate-preferences";

type ActionTargetProfile = {
  actionTargetId?: string;
  id?: string;
};

type DisplayScoreProfile = {
  compatibilityScore?: number;
  match: number;
};

type PreferenceFitProfile = DisplayScoreProfile & {
  preferenceFit: {
    score: number;
  };
};

export function buildRoommateDeckApiPath(preference: RoommatePreference, cursor = 0) {
  const params = new URLSearchParams({
    limit: "80",
    cursor: String(cursor),
    budgetMin: String(preference.budgetMin),
    budgetMax: String(preference.budgetMax),
    school: preference.schools[0] ?? "",
    schools: preference.schools.join(","),
    hobby: preference.hobbies[0] ?? "",
    hobbies: preference.hobbies.join(","),
    gender: preference.gender
  });

  return `/roommates/deck?${params.toString()}`;
}

export function hydrateRoommateDeck<T>(
  primaryRoommates: T[],
  fallbackRoommates: T[],
  getKey: (roommate: T) => string,
  targetSize = 240
) {
  const seenRoommateKeys = new Set(primaryRoommates.map(getKey));
  const fallbackFill = fallbackRoommates
    .filter((candidate) => !seenRoommateKeys.has(getKey(candidate)))
    .slice(0, Math.max(0, targetSize - primaryRoommates.length));

  return [...primaryRoommates, ...fallbackFill];
}

export function getRoommateActionTargetId(roommate: ActionTargetProfile) {
  return roommate.actionTargetId ?? roommate.id;
}

export function getRoommateDisplayScore<T extends DisplayScoreProfile>(
  roommate: T | PreferenceFitProfile
) {
  if ("preferenceFit" in roommate) {
    return Math.max(roommate.compatibilityScore ?? 0, roommate.preferenceFit.score);
  }

  return roommate.compatibilityScore ?? roommate.match;
}

export function mergeUniqueText(...groups: Array<Array<string> | undefined>) {
  return Array.from(new Set(groups.flatMap((group) => group ?? []).filter(Boolean)));
}
