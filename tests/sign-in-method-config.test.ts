import { describe, expect, it } from "vitest";

// @ts-expect-error The deploy preflight is a directly executed JavaScript module.
import { validateAuthProviderConfig, validatePhoneAuthConfig } from "../tools/production-config.mjs";

const neonWeb = {
  NEXT_PUBLIC_AUTH_PROVIDER: "neon",
  NEON_AUTH_BASE_URL: "https://ep-psw-test.neonauth.us-east-2.aws.neon.tech/neondb/auth",
  NEON_AUTH_APP_ORIGIN: "https://sublet-pipeline-demo-zihao.netlify.app",
  NEON_AUTH_COOKIE_SECRET: "k".repeat(40)
};
const sid = (prefix: string) => `${prefix}${"0f".repeat(16)}`;
const twilio = { PHONE_AUTH_PROVIDER: "twilio-verify", TWILIO_ACCOUNT_SID: sid("AC"), TWILIO_VERIFY_SERVICE_SID: sid("VA"), TWILIO_API_KEY_SID: sid("SK"), TWILIO_API_KEY_SECRET: "Z".repeat(32) };

describe("sign-in method configuration gate", () => {
  it("accepts the supported website method lists", () => {
    for (const methods of [undefined, "google", "google,email", "google,github,email,phone"]) {
      expect(validateAuthProviderConfig({ ...neonWeb, NEXT_PUBLIC_AUTH_METHODS: methods }, true)).toEqual([]);
    }
  });

  it("rejects unknown, duplicate, phone-only or email-mode method lists", () => {
    for (const methods of ["google,sms", "email,email", "phone", "google,"]) {
      expect(validateAuthProviderConfig({ ...neonWeb, NEXT_PUBLIC_AUTH_METHODS: methods }, true)).not.toEqual([]);
    }
    expect(validateAuthProviderConfig({ NEXT_PUBLIC_AUTH_METHODS: "email" }, true)).not.toEqual([]);
  });

  it("keeps phone sign-in off by default and requires real Twilio Verify settings when on", () => {
    expect(validatePhoneAuthConfig({})).toEqual([]);
    expect(validatePhoneAuthConfig(twilio)).toEqual([]);
    expect(validatePhoneAuthConfig({ ...twilio, PHONE_AUTH_REGIONS: "US_CA,CN" })).toEqual([]);
    expect(validatePhoneAuthConfig({ PHONE_AUTH_PROVIDER: "development" })).not.toEqual([]);
    expect(validatePhoneAuthConfig({ ...twilio, PHONE_AUTH_REGIONS: "UK" })).not.toEqual([]);
    expect(validatePhoneAuthConfig({ ...twilio, TWILIO_AUTH_TOKEN: "0f".repeat(16) })).not.toEqual([]);
    expect(validatePhoneAuthConfig({ ...twilio, TWILIO_VERIFY_SERVICE_SID: "" })).not.toEqual([]);
    expect(validatePhoneAuthConfig({ ...twilio, NEXT_PUBLIC_TWILIO_ACCOUNT_SID: sid("AC") })).not.toEqual([]);
  });
});
