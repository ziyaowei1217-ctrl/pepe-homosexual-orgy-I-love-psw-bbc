import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export function normalizeEmail(emailInput: string) {
  return emailInput.trim().toLowerCase();
}

export function generateEmailCode() {
  return randomInt(100000, 1000000).toString();
}

export function hashEmailCode(email: string, code: string) {
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code}`)
    .digest("hex");
}

export function verifyEmailCodeHash(email: string, code: string, codeHash: string) {
  const candidate = hashEmailCode(email, code);
  const candidateBuffer = Buffer.from(candidate, "hex");
  const hashBuffer = Buffer.from(codeHash, "hex");
  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}
