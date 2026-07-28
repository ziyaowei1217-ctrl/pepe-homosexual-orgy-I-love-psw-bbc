import type { RoommatePreference, SharedLivingGenderPreference } from "@/lib/roommate-preferences";

const roommatePreferenceStorageKey = "sublet_roommate_preference_v1";
const genderPreferences = new Set<SharedLivingGenderPreference>(["Open", "Women", "Men", "Non-binary"]);

export function readStoredRoommatePreference(fallback: RoommatePreference): RoommatePreference {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return fallback;

  try {
    const stored = window.localStorage.getItem(roommatePreferenceStorageKey);
    if (!stored) return fallback;

    return normalizeRoommatePreference(JSON.parse(stored), fallback);
  } catch {
    return fallback;
  }
}

export function writeStoredRoommatePreference(preference: RoommatePreference) {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;

  try {
    window.localStorage.setItem(roommatePreferenceStorageKey, JSON.stringify(preference));
  } catch {
    // Embedded browsers and private sessions may deny storage.
  }
}

function normalizeRoommatePreference(value: unknown, fallback: RoommatePreference): RoommatePreference {
  if (!value || typeof value !== "object") return fallback;

  const candidate = value as Partial<RoommatePreference>;
  const gender = candidate.gender && genderPreferences.has(candidate.gender) ? candidate.gender : fallback.gender;
  const budgetMin = getSafeBudget(candidate.budgetMin, fallback.budgetMin);
  const budgetMax = Math.max(budgetMin, getSafeBudget(candidate.budgetMax, fallback.budgetMax));

  return {
    gender,
    budgetMin,
    budgetMax,
    schools: normalizeStringList(candidate.schools, fallback.schools),
    hobbies: normalizeStringList(candidate.hobbies, fallback.hobbies)
  };
}

function getSafeBudget(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback;
}

function normalizeStringList(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 12);

  return normalized;
}
