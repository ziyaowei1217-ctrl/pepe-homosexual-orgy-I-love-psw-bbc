import { isIP } from "node:net";
import { HttpException, ServiceUnavailableException } from "@nestjs/common";

import { hashSecurityIdentifier, normalizeEmail } from "./code-security";

export type AuthRateLimitAction = "send" | "verify";
export type AuthRateLimitPurpose = "LOGIN" | "ADMIN_STEP_UP";
export type AuthRateLimitIdentity = { email: string; ip: string; deviceId?: string };
export type RateLimitRule = {
  key: string;
  dimension: string;
  limit: number;
  windowSeconds: number;
};
export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };
export interface RateLimitStore {
  consume(rules: RateLimitRule[]): Promise<RateLimitResult>;
}

type AuthRateLimiterOptions = {
  store: RateLimitStore;
  identifierHashSecret: string;
  nodeEnv: string;
};

type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
};

export class AuthRateLimitException extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(
      {
        statusCode: 429,
        error: "Too Many Requests",
        code: "AUTH_RATE_LIMITED",
        message: "Too many authentication attempts"
      },
      429
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class AuthRateLimiter {
  constructor(private readonly options: AuthRateLimiterOptions) {}

  async enforce(action: AuthRateLimitAction, purpose: AuthRateLimitPurpose, identity: AuthRateLimitIdentity) {
    try {
      const result = await this.options.store.consume(this.rules(action, purpose, identity));
      if (!result.allowed) throw new AuthRateLimitException(Math.max(1, result.retryAfterSeconds));
    } catch (error) {
      if (error instanceof AuthRateLimitException) throw error;
      if (this.options.nodeEnv !== "production") return;
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: "Service Unavailable",
        code: "AUTH_DELIVERY_UNAVAILABLE",
        message: "Authentication delivery is temporarily unavailable"
      });
    }
  }

  private rules(
    action: AuthRateLimitAction,
    purpose: AuthRateLimitPurpose,
    identity: AuthRateLimitIdentity
  ): RateLimitRule[] {
    const hash = (value: string) => hashSecurityIdentifier(value, this.options.identifierHashSecret);
    const emailHash = hash(normalizeEmail(identity.email));
    const purposeEmailHash = `${purpose.toLowerCase()}:${emailHash}`;
    const ipHash = hash(identity.ip);
    const deviceHash = hash(identity.deviceId ?? `ip-fallback:${identity.ip}`);

    if (action === "send") {
      return [
        rule("send", "email-hour", purposeEmailHash, 5, 3_600),
        rule("send", "email-day", purposeEmailHash, 10, 86_400),
        rule("send", "device-hour", deviceHash, 10, 3_600),
        rule("send", "ip-hour", ipHash, 30, 3_600),
        rule("send", "global-minute", "all", 100, 60)
      ];
    }

    return [
      rule("verify", "email-15m", purposeEmailHash, 15, 900),
      rule("verify", "device-15m", deviceHash, 30, 900),
      rule("verify", "ip-15m", ipHash, 100, 900),
      rule("verify", "global-minute", "all", 300, 60)
    ];
  }
}

export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly events = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(rules: RateLimitRule[]) {
    const nowMs = this.now();
    const states = rules.map((entry) => {
      const windowMs = entry.windowSeconds * 1000;
      const cutoffMs = nowMs - windowMs;
      const activeEvents = (this.events.get(entry.key) ?? []).filter((timestamp) => timestamp > cutoffMs);
      return {
        entry,
        activeEvents,
        retryAtMs: (activeEvents[0] ?? nowMs) + windowMs
      };
    });
    const denied = states.filter(({ entry, activeEvents }) => activeEvents.length >= entry.limit);
    if (denied.length > 0) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          ...denied.map(({ retryAtMs }) => Math.ceil((retryAtMs - nowMs) / 1000))
        )
      };
    }
    for (const state of states) {
      this.events.set(state.entry.key, [...state.activeEvents, nowMs]);
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

export function getRequestIdentity(request: RequestLike) {
  const ip = normalizeIp(request.ip);
  const deviceHeader = request.headers?.["x-device-id"];
  const rawDevice = Array.isArray(deviceHeader) ? deviceHeader[0] : deviceHeader;
  const deviceId = rawDevice && isUuid(rawDevice.trim()) ? rawDevice.trim().toLowerCase() : undefined;
  return { ip, deviceId };
}

function rule(action: string, dimension: string, identifier: string, limit: number, windowSeconds: number) {
  return {
    key: `auth:${action}:${dimension}:${identifier}`,
    dimension,
    limit,
    windowSeconds
  } satisfies RateLimitRule;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeIp(value: string | undefined) {
  const candidate = value?.trim().toLowerCase();
  if (!candidate) return "unknown";
  if (candidate.startsWith("::ffff:") && isIP(candidate.slice("::ffff:".length)) === 4) {
    return candidate.slice("::ffff:".length);
  }
  const version = isIP(candidate);
  if (version === 4) return candidate;
  if (version === 6) {
    const normalized = new URL(`http://[${candidate}]/`).hostname.slice(1, -1);
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
    if (!mapped) return normalized;
    const high = Number.parseInt(mapped[1], 16);
    const low = Number.parseInt(mapped[2], 16);
    return [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
  }
  return "unknown";
}
