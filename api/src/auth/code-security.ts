import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function normalizeEmail(emailInput: string) {
  return emailInput.trim().toLowerCase();
}

export function generateEmailCode() {
  return randomInt(100000, 1000000).toString();
}

export function generateCodeSalt() {
  return randomBytes(16).toString("hex");
}

export type EmailCodeHashInput = {
  email: string;
  purpose: string;
  salt: string;
  code: string;
  secret: string;
};

export function hashEmailCode(input: EmailCodeHashInput) {
  return createHmac("sha256", input.secret)
    .update(`${normalizeEmail(input.email)}\0${input.purpose}\0${input.salt}\0${input.code}`)
    .digest("hex");
}

export function verifyEmailCodeHash(input: EmailCodeHashInput & { codeHash: string }) {
  const candidateBuffer = Buffer.from(hashEmailCode(input), "hex");
  const hashBuffer = Buffer.from(input.codeHash, "hex");
  return candidateBuffer.length === hashBuffer.length && timingSafeEqual(candidateBuffer, hashBuffer);
}

export function hashSecurityIdentifier(identifier: string, secret: string) {
  return createHmac("sha256", secret).update(identifier).digest("hex");
}
