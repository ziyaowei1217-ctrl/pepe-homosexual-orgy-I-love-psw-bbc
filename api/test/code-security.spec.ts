import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  generateCodeSalt,
  hashEmailCode,
  hashSecurityIdentifier,
  verifyEmailCodeHash
} from "../src/auth/code-security";

describe("verification code security", () => {
  it("uses a random 16-byte salt and purpose-bound HMAC", () => {
    const firstSalt = generateCodeSalt();
    const secondSalt = generateCodeSalt();
    expect(firstSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(secondSalt).not.toBe(firstSalt);

    const actual = hashEmailCode({
      email: " Student@Example.com ",
      purpose: "LOGIN",
      salt: "00112233445566778899aabbccddeeff",
      code: "123456",
      secret: "otp-secret"
    });
    const expected = createHmac("sha256", "otp-secret")
      .update("student@example.com\u0000LOGIN\u000000112233445566778899aabbccddeeff\u0000123456")
      .digest("hex");
    expect(actual).toBe(expected);
  });

  it("rejects a hash when email, purpose, salt, code, or hash length differs", () => {
    const input = {
      email: "student@example.com",
      purpose: "LOGIN",
      salt: "00112233445566778899aabbccddeeff",
      code: "123456",
      secret: "otp-secret"
    } as const;
    const codeHash = hashEmailCode(input);

    expect(verifyEmailCodeHash({ ...input, codeHash })).toBe(true);
    expect(verifyEmailCodeHash({ ...input, email: "other@example.com", codeHash })).toBe(false);
    expect(verifyEmailCodeHash({ ...input, purpose: "ADMIN_STEP_UP", codeHash })).toBe(false);
    expect(verifyEmailCodeHash({ ...input, salt: "10112233445566778899aabbccddeeff", codeHash })).toBe(false);
    expect(verifyEmailCodeHash({ ...input, code: "654321", codeHash })).toBe(false);
    expect(verifyEmailCodeHash({ ...input, codeHash: "00" })).toBe(false);
  });

  it("hashes security identifiers without retaining their plaintext", () => {
    expect(hashSecurityIdentifier(" Student@Example.com ", "identifier-secret")).toBe(
      createHmac("sha256", "identifier-secret").update(" Student@Example.com ").digest("hex")
    );
  });
});
