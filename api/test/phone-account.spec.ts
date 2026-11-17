import { describe, expect, it } from "vitest";

import { fallbackDisplayName, isPhoneAccountEmail, newPhoneAccountEmail } from "../src/auth/phone-account";

describe("phone account placeholders", () => {
  it("gives each phone account a random placeholder address under the reserved domain", () => {
    const first = newPhoneAccountEmail();
    expect(first).toMatch(/^phone-[0-9a-f]{20}@phone\.psw\.invalid$/);
    expect(newPhoneAccountEmail()).not.toBe(first);
    expect(isPhoneAccountEmail(first.toUpperCase())).toBe(true);
    expect(isPhoneAccountEmail("renter@phone.psw.invalid.example.com")).toBe(false);
  });

  it("shows other people a neutral name for a phone account instead of its placeholder address", () => {
    expect(fallbackDisplayName("phone-0123456789abcdef4f2a@phone.psw.invalid")).toBe("psw 用户 4f2a");
    expect(fallbackDisplayName("renter@example.com")).toBe("renter");
  });
});
