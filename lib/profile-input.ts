import type { UpdateProfileInput } from "./api";

export type OnboardingProfileInput = {
  [Field in "displayName" | "school" | "city" | "role"]: NonNullable<UpdateProfileInput[Field]>;
};

export function buildOnboardingProfileInput(
  draft: OnboardingProfileInput
): OnboardingProfileInput {
  return {
    displayName: draft.displayName.trim(),
    school: draft.school.trim(),
    city: draft.city.trim(),
    role: draft.role
  };
}

export function buildProfileUpdateInput(draft: UpdateProfileInput): UpdateProfileInput {
  return removeUndefined({
    displayName: optionalText(draft.displayName),
    avatarUrl: optionalText(draft.avatarUrl),
    school: optionalText(draft.school),
    city: optionalText(draft.city),
    role: draft.role,
    wechat: optionalText(draft.wechat),
    instagram: optionalText(draft.instagram),
    bio: optionalText(draft.bio)
  });
}

function optionalText(value?: string | null) {
  if (value === undefined) return undefined;
  const trimmed = value?.trim();
  return trimmed || null;
}

function removeUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}
