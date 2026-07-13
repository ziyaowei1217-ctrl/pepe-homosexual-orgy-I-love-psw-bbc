export type RoommateGender = "Woman" | "Man" | "Non-binary";

export type SharedLivingGenderPreference = "Open" | "Women" | "Men" | "Non-binary";

export type RoommatePreference = {
  gender: SharedLivingGenderPreference;
  budgetMin: number;
  budgetMax: number;
  schools: string[];
  hobbies: string[];
};

export type PreferenceRoommateProfile = {
  name: string;
  role: string;
  match: number;
  budget: string;
  gender?: RoommateGender;
  tags: string[];
};

export type RoommatePreferenceFit = {
  score: number;
  reasons: string[];
  gaps: string[];
  sharedHobbies: string[];
  schoolMatches: string[];
};

export type RankedRoommate<T extends PreferenceRoommateProfile> = T & {
  preferenceFit: RoommatePreferenceFit;
};

const currency = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  style: "currency",
  currency: "USD"
});

export function rankRoommatesByPreference<T extends PreferenceRoommateProfile>(
  roommates: T[],
  preference: RoommatePreference
): Array<RankedRoommate<T>> {
  return roommates
    .map((roommate) => ({
      ...roommate,
      preferenceFit: buildRoommatePreferenceFit(roommate, preference)
    }))
    .sort((first, second) => {
      const scoreDiff = second.preferenceFit.score - first.preferenceFit.score;
      if (scoreDiff !== 0) return scoreDiff;

      const firstBudgetDistance = getBudgetDistance(getRoommateBudgetNumber(first), preference);
      const secondBudgetDistance = getBudgetDistance(getRoommateBudgetNumber(second), preference);
      if (firstBudgetDistance !== secondBudgetDistance) return firstBudgetDistance - secondBudgetDistance;

      return second.match - first.match;
    });
}

export function getRoommateDeckCandidates<T>(rankedRoommates: readonly T[]) {
  return [...rankedRoommates];
}

export function buildRoommatePreferenceFit(
  roommate: PreferenceRoommateProfile,
  preference: RoommatePreference
): RoommatePreferenceFit {
  const budget = getRoommateBudgetNumber(roommate);
  const budgetDistance = getBudgetDistance(budget, preference);
  const budgetInRange = budgetDistance === 0;
  const schoolMatches = getSchoolMatches(roommate.role, preference.schools);
  const sharedHobbies = getSharedHobbies(roommate.tags, preference.hobbies);
  const genderAligned = isGenderAligned(roommate.gender, preference.gender);

  const genderScore = getGenderScore(roommate.gender, preference.gender);
  const budgetScore = budgetInRange ? 22 : Math.max(0, 16 - Math.round(budgetDistance / 45));
  const schoolScore = preference.schools.length === 0 ? 12 : schoolMatches.length > 0 ? 16 : 4;
  const hobbyScore =
    preference.hobbies.length === 0 ? 12 : Math.min(18, sharedHobbies.length * 9);
  const baseScore = Math.round(roommate.match * 0.32);
  const score = clampScore(baseScore + genderScore + budgetScore + schoolScore + hobbyScore);

  const reasons: string[] = [];
  const gaps: string[] = [];

  if (preference.gender === "Open") {
    reasons.push("Open shared-living preference");
  } else if (genderAligned) {
    reasons.push("Shared-living preference aligned");
  } else {
    gaps.push(roommate.gender ? "Shared-living preference differs" : "Shared-living preference pending");
  }

  if (budgetInRange) {
    reasons.push(`${currency.format(budget)} budget fit`);
  } else {
    gaps.push("Budget outside range");
  }

  if (schoolMatches.length > 0) {
    reasons.push(...schoolMatches.map((school) => `${school} track`));
  } else if (preference.schools.length > 0) {
    gaps.push("Different school track");
  }

  if (sharedHobbies.length > 0) {
    reasons.push(`${sharedHobbies.length} shared ${sharedHobbies.length === 1 ? "hobby" : "hobbies"}`);
  } else if (preference.hobbies.length > 0) {
    gaps.push("Hobbies still pending");
  }

  return {
    score,
    reasons,
    gaps,
    sharedHobbies,
    schoolMatches
  };
}

export function getRoommateBudgetNumber(roommate: Pick<PreferenceRoommateProfile, "budget">) {
  const parsed = Number(roommate.budget.replace(/[^0-9]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBudgetDistance(budget: number, preference: Pick<RoommatePreference, "budgetMin" | "budgetMax">) {
  if (budget <= 0) return Number.POSITIVE_INFINITY;
  if (budget < preference.budgetMin) return preference.budgetMin - budget;
  if (budget > preference.budgetMax) return budget - preference.budgetMax;
  return 0;
}

function getSchoolMatches(role: string, selectedSchools: string[]) {
  if (selectedSchools.length === 0) return [];
  const normalizedRole = normalizeText(role);

  return selectedSchools.filter((school) => normalizedRole.includes(normalizeText(school)));
}

function getSharedHobbies(tags: string[], selectedHobbies: string[]) {
  if (selectedHobbies.length === 0) return [];
  const normalizedTags = new Set(tags.map(normalizeText));

  return selectedHobbies.filter((hobby) => normalizedTags.has(normalizeText(hobby)));
}

function isGenderAligned(gender: RoommateGender | undefined, preference: SharedLivingGenderPreference) {
  if (preference === "Open") return true;
  if (!gender) return false;

  return normalizeGender(gender) === normalizeGender(preference);
}

function getGenderScore(gender: RoommateGender | undefined, preference: SharedLivingGenderPreference) {
  if (preference === "Open") return 16;
  if (!gender) return 7;
  return isGenderAligned(gender, preference) ? 16 : 0;
}

function normalizeGender(value: RoommateGender | SharedLivingGenderPreference) {
  if (value === "Women" || value === "Woman") return "woman";
  if (value === "Men" || value === "Man") return "man";
  if (value === "Non-binary") return "non-binary";
  return "open";
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function clampScore(value: number) {
  return Math.max(50, Math.min(99, value));
}
