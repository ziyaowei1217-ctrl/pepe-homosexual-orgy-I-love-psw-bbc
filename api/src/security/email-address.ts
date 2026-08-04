import { isEmail } from "class-validator";

export function normalizeEmailAddress(input: string) {
  return input.trim().toLowerCase();
}

export function normalizeValidatedEmailAddress(input: unknown) {
  if (typeof input !== "string") return undefined;
  const normalized = normalizeEmailAddress(input);
  return normalized && isEmail(normalized) ? normalized : undefined;
}
