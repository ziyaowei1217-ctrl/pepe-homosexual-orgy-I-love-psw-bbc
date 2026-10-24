import { describe, expect, it, vi } from "vitest";

import { maskPhoneNumber, normalizePhoneNumber, parsePhoneRegions } from "../src/auth/phone-number";
import { getPhoneAuthConfig, PhoneVerificationUnavailableError, TwilioVerifyProvider } from "../src/auth/phone-verification-provider";

const sid = (prefix: string) => `${prefix}${"a1".repeat(16)}`;
const twilioEnvironment = { PHONE_AUTH_PROVIDER: "twilio-verify", TWILIO_ACCOUNT_SID: sid("AC"), TWILIO_VERIFY_SERVICE_SID: sid("VA"), TWILIO_API_KEY_SID: sid("SK"), TWILIO_API_KEY_SECRET: "A".repeat(32) };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("phone number normalization", () => {
  it("accepts US, Canadian and mainland China mobile formats and rejects everything else", () => {
    const both = parsePhoneRegions("US_CA,CN");
    expect(normalizePhoneNumber("(415) 555-2671", both)).toBe("+14155552671");
    expect(normalizePhoneNumber("+1 604 555 0199", both)).toBe("+16045550199");
    expect(normalizePhoneNumber("0014155552671", both)).toBe("+14155552671");
    expect(normalizePhoneNumber("138 0013 8000", both)).toBe("+8613800138000");
    expect(normalizePhoneNumber("+86 138-0013-8000", both)).toBe("+8613800138000");
    for (const value of ["+18765550123", "+12425550123", "+19115550100", "+14115550100", "+447700900123", "+8610012345678", "+1 415 555 267", "4155552671x", "", "+", "＋14155552671", 14155552671]) {
      expect(normalizePhoneNumber(value, both)).toBeNull();
    }
    expect(normalizePhoneNumber("+8613800138000", parsePhoneRegions("US_CA"))).toBeNull();
    expect(normalizePhoneNumber("4155552671", parsePhoneRegions("CN"))).toBeNull();
  });

  it("masks all but the last four digits", () => {
    expect(maskPhoneNumber("+14155552671")).toBe("+1 ••• ••• 2671");
    expect(maskPhoneNumber("+8613800138000")).toBe("+86 ••• •••• 8000");
  });

  it("refuses unknown or duplicate regions", () => {
    expect(() => parsePhoneRegions("US_CA,US_CA")).toThrow();
    expect(() => parsePhoneRegions("UK")).toThrow();
    expect(() => parsePhoneRegions(" ")).toThrow();
  });
});

describe("phone provider configuration", () => {
  it("is off by default and refuses development codes in production", () => {
    expect(getPhoneAuthConfig({})).toEqual({ enabled: false });
    expect(() => getPhoneAuthConfig({ NODE_ENV: "production", PHONE_AUTH_PROVIDER: "development" })).toThrow();
    expect(getPhoneAuthConfig({ NODE_ENV: "test", PHONE_AUTH_PROVIDER: "development" })).toMatchObject({ enabled: true, regions: ["US_CA"] });
    expect(() => getPhoneAuthConfig({ PHONE_AUTH_PROVIDER: "console" })).toThrow();
  });

  it("requires well-formed Twilio identifiers and exactly one credential kind", () => {
    expect(getPhoneAuthConfig(twilioEnvironment)).toMatchObject({ enabled: true });
    expect(getPhoneAuthConfig({ ...twilioEnvironment, TWILIO_API_KEY_SID: undefined, TWILIO_API_KEY_SECRET: undefined, TWILIO_AUTH_TOKEN: "f".repeat(32) })).toMatchObject({ enabled: true });
    expect(() => getPhoneAuthConfig({ ...twilioEnvironment, TWILIO_AUTH_TOKEN: "f".repeat(32) })).toThrow();
    expect(() => getPhoneAuthConfig({ ...twilioEnvironment, TWILIO_VERIFY_SERVICE_SID: "VAreplace-me" })).toThrow();
    expect(() => getPhoneAuthConfig({ ...twilioEnvironment, TWILIO_ACCOUNT_SID: "" })).toThrow();
    expect(() => getPhoneAuthConfig({ ...twilioEnvironment, TWILIO_API_KEY_SECRET: "short" })).toThrow();
  });
});

describe("Twilio Verify client", () => {
  const provider = (fetchImpl: ReturnType<typeof vi.fn>, timeoutMs?: number) =>
    new TwilioVerifyProvider({ serviceSid: sid("VA"), username: sid("SK"), password: "A".repeat(32), fetchImpl: fetchImpl as never, timeoutMs });

  it("starts an SMS verification with a fixed request shape and no redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json(201, { status: "pending" }));
    await expect(provider(fetchImpl).start("+14155552671")).resolves.toEqual({ status: "sent" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://verify.twilio.com/v2/Services/${sid("VA")}/Verifications`);
    expect(init).toMatchObject({ method: "POST", redirect: "error" });
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from(`${sid("SK")}:${"A".repeat(32)}`).toString("base64")}`);
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({ To: "+14155552671", Channel: "sms", Locale: "zh" });
  });

  it("maps provider throttling, refusals and outages without leaking provider text", async () => {
    await expect(provider(vi.fn().mockResolvedValue(json(429, { code: 60203 }))).start("+14155552671")).resolves.toEqual({ status: "rate_limited" });
    await expect(provider(vi.fn().mockResolvedValue(json(400, { code: 60200 }))).start("+14155552671")).resolves.toEqual({ status: "rejected" });
    await expect(provider(vi.fn().mockResolvedValue(json(500, {}))).start("+14155552671")).rejects.toBeInstanceOf(PhoneVerificationUnavailableError);
    await expect(provider(vi.fn().mockRejectedValue(new TypeError("network"))).start("+14155552671")).rejects.toBeInstanceOf(PhoneVerificationUnavailableError);
    const hanging = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(provider(hanging, 20).start("+14155552671")).rejects.toBeInstanceOf(PhoneVerificationUnavailableError);
  });

  it("approves only an explicit approved and valid check", async () => {
    await expect(provider(vi.fn().mockResolvedValue(json(200, { status: "approved", valid: true }))).check("+14155552671", "123456")).resolves.toBe("approved");
    await expect(provider(vi.fn().mockResolvedValue(json(200, { status: "pending", valid: false }))).check("+14155552671", "123456")).resolves.toBe("invalid");
    await expect(provider(vi.fn().mockResolvedValue(json(200, { status: "approved", valid: "true" }))).check("+14155552671", "123456")).resolves.toBe("invalid");
    await expect(provider(vi.fn().mockResolvedValue(json(404, { code: 20404 }))).check("+14155552671", "123456")).resolves.toBe("invalid");
    await expect(provider(vi.fn().mockResolvedValue(new Response("x".repeat(20_000), { status: 200 }))).check("+14155552671", "123456")).resolves.toBe("invalid");
    await expect(provider(vi.fn().mockResolvedValue(json(503, {}))).check("+14155552671", "123456")).rejects.toBeInstanceOf(PhoneVerificationUnavailableError);
  });
});
