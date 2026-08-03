import { BadRequestException } from "@nestjs/common";

import { normalizeValidatedEmailAddress } from "../security/email-address";

export function requireOperationsEmail(input: unknown, field: "Target" | "Operator") {
  if (typeof input !== "string" || /\s/u.test(input)) {
    throw new BadRequestException(`${field} email must be a valid email without whitespace`);
  }
  const normalized = normalizeValidatedEmailAddress(input);
  if (!normalized) throw new BadRequestException(`${field} email must be a valid email without whitespace`);
  return normalized;
}

export function requireOperationsReason(input: unknown) {
  if (typeof input !== "string") throw new BadRequestException("Reason is required");
  const reason = input.trim();
  if (!reason) throw new BadRequestException("Reason is required");
  return reason;
}

export function maskEmail(input: string) {
  const email = normalizeValidatedEmailAddress(input);
  if (!email) throw new BadRequestException("Email must be valid before masking");
  const [local, domain] = email.split("@");
  const visibleLocal =
    local.length <= 2 ? `${local[0]}*` : `${local[0]}${"*".repeat(local.length - 2)}${local.at(-1)}`;
  return `${visibleLocal}@${domain}`;
}
