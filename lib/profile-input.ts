import type { UpdateProfileInput } from "./api";

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

function optionalText(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function removeUndefined<T extends Record<string, unknown>>(input: T) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as T;
}
