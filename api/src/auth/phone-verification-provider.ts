import { randomInt, timingSafeEqual } from "node:crypto";

import { parsePhoneRegions, type PhoneRegion } from "./phone-number";

export const PHONE_PROVIDER_TIMEOUT_MS = 5_000;
// Above a typical Twilio Verify round trip, so padded responses look alike.
export const TWILIO_RESPONSE_FLOOR_MS = 1_200;
const MAX_PROVIDER_RESPONSE_BYTES = 16_384;

export type PhoneStartResult = { status: "sent"; devCode?: string } | { status: "rate_limited" } | { status: "rejected" };
export type PhoneCheckResult = "approved" | "invalid";

export interface PhoneVerificationProvider {
  readonly name: "twilio-verify" | "development";
  start(phoneNumber: string): Promise<PhoneStartResult>;
  check(phoneNumber: string, code: string): Promise<PhoneCheckResult>;
}

export class PhoneVerificationUnavailableError extends Error {
  constructor() { super("Phone verification is temporarily unavailable"); }
}

export type PhoneAuthConfig =
  | { enabled: false }
  // responseFloorMs pads phone responses to a fixed minimum so their timing
  // does not show whether a number is linked or the provider was called.
  | { enabled: true; regions: PhoneRegion[]; provider: PhoneVerificationProvider; responseFloorMs?: number };

type Environment = Record<string, string | undefined>;
type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

// Phone sign-in stays off unless an operator selects a real provider. There is
// no silent fallback: a misconfigured provider stops the API from starting.
export function getPhoneAuthConfig(environment: Environment = process.env, fetchImpl: FetchLike = fetch): PhoneAuthConfig {
  const provider = environment.PHONE_AUTH_PROVIDER ?? "disabled";
  if (provider === "disabled") return { enabled: false };
  const regions = parsePhoneRegions(environment.PHONE_AUTH_REGIONS);
  if (provider === "development") {
    if (environment.NODE_ENV === "production") throw new Error("PHONE_AUTH_PROVIDER=development is not allowed in production");
    return { enabled: true, regions, provider: new DevelopmentPhoneVerificationProvider() };
  }
  if (provider !== "twilio-verify") throw new Error("PHONE_AUTH_PROVIDER must be disabled, twilio-verify or development");
  const accountSid = environment.TWILIO_ACCOUNT_SID ?? "";
  const serviceSid = environment.TWILIO_VERIFY_SERVICE_SID ?? "";
  const apiKeySid = environment.TWILIO_API_KEY_SID ?? "";
  const apiKeySecret = environment.TWILIO_API_KEY_SECRET ?? "";
  const authToken = environment.TWILIO_AUTH_TOKEN ?? "";
  if (!/^AC[0-9a-f]{32}$/.test(accountSid)) throw new Error("TWILIO_ACCOUNT_SID must be a Twilio account SID (AC…)");
  if (!/^VA[0-9a-f]{32}$/.test(serviceSid)) throw new Error("TWILIO_VERIFY_SERVICE_SID must be a Twilio Verify service SID (VA…)");
  let username: string;
  let password: string;
  if (apiKeySid || apiKeySecret) {
    if (authToken) throw new Error("Configure either a Twilio API key or the account auth token, not both");
    if (!/^SK[0-9a-f]{32}$/.test(apiKeySid)) throw new Error("TWILIO_API_KEY_SID must be a Twilio API key SID (SK…)");
    if (!/^[A-Za-z0-9]{32}$/.test(apiKeySecret)) throw new Error("TWILIO_API_KEY_SECRET must be the 32-character API key secret");
    username = apiKeySid;
    password = apiKeySecret;
  } else {
    if (!/^[0-9a-f]{32}$/.test(authToken)) throw new Error("Twilio Verify needs TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN");
    username = accountSid;
    password = authToken;
  }
  return { enabled: true, regions, provider: new TwilioVerifyProvider({ serviceSid, username, password, fetchImpl }), responseFloorMs: TWILIO_RESPONSE_FLOOR_MS };
}

export class TwilioVerifyProvider implements PhoneVerificationProvider {
  readonly name = "twilio-verify" as const;
  private readonly authorization: string;

  constructor(private readonly options: { serviceSid: string; username: string; password: string; fetchImpl: FetchLike; timeoutMs?: number }) {
    this.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  }

  async start(phoneNumber: string): Promise<PhoneStartResult> {
    const { status, body } = await this.post("Verifications", { To: phoneNumber, Channel: "sms", Locale: "zh" });
    if (status === 201 || status === 200) return { status: "sent" };
    // 60203: too many sends to this number; 60410: blocked by fraud protection;
    // 60605/60220: destination not permitted by the account's geo settings.
    if (status === 429 || body.code === 60203) return { status: "rate_limited" };
    if (status === 400 || status === 403) return { status: "rejected" };
    throw new PhoneVerificationUnavailableError();
  }

  async check(phoneNumber: string, code: string): Promise<PhoneCheckResult> {
    const { status, body } = await this.post("VerificationCheck", { To: phoneNumber, Code: code });
    if (status === 200) return body.status === "approved" && body.valid === true ? "approved" : "invalid";
    // 404: no pending verification (expired, already used or never sent).
    // 429/60202: the provider's own attempt limit was reached.
    if (status === 404 || status === 429 || status === 400) return "invalid";
    throw new PhoneVerificationUnavailableError();
  }

  private async post(resource: "Verifications" | "VerificationCheck", fields: Record<string, string>) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? PHONE_PROVIDER_TIMEOUT_MS);
    try {
      const response = await this.options.fetchImpl(`https://verify.twilio.com/v2/Services/${this.options.serviceSid}/${resource}`, {
        method: "POST",
        headers: { Authorization: this.authorization, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams(fields).toString(),
        redirect: "error",
        signal: controller.signal
      });
      return { status: response.status, body: await readSmallJson(response) };
    } catch (error) {
      if (error instanceof PhoneVerificationUnavailableError) throw error;
      throw new PhoneVerificationUnavailableError();
    } finally {
      clearTimeout(timer);
    }
  }
}

async function readSmallJson(response: Response): Promise<{ status?: unknown; valid?: unknown; code?: unknown }> {
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PROVIDER_RESPONSE_BYTES) { await reader.cancel(); return {}; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

// Local development and tests only: codes stay in memory and are returned to the
// caller instead of being texted. Production configuration refuses this provider.
export class DevelopmentPhoneVerificationProvider implements PhoneVerificationProvider {
  readonly name = "development" as const;
  private readonly pending = new Map<string, { code: string; expiresAt: number; attempts: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async start(phoneNumber: string): Promise<PhoneStartResult> {
    const code = randomInt(100000, 1000000).toString();
    this.pending.set(phoneNumber, { code, expiresAt: this.now() + 10 * 60_000, attempts: 0 });
    return { status: "sent", devCode: code };
  }

  async check(phoneNumber: string, code: string): Promise<PhoneCheckResult> {
    const entry = this.pending.get(phoneNumber);
    if (!entry || entry.expiresAt <= this.now() || entry.attempts >= 5) { this.pending.delete(phoneNumber); return "invalid"; }
    entry.attempts += 1;
    const matches = code.length === entry.code.length && timingSafeEqual(Buffer.from(code), Buffer.from(entry.code));
    if (!matches) return "invalid";
    this.pending.delete(phoneNumber);
    return "approved";
  }
}
