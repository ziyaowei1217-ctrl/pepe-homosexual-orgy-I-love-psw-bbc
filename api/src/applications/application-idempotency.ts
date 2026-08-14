import { BadRequestException } from "@nestjs/common";

const visibleAsciiKey = /^[\x21-\x7e]{8,120}$/;

export function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !visibleAsciiKey.test(value)) {
    throw new BadRequestException("Idempotency-Key must contain 8-120 visible ASCII characters");
  }
  return value;
}
