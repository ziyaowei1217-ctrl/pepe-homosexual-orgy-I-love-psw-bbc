import { HttpException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  AuthRateLimiter,
  AuthRateLimitException,
  getRequestIdentity,
  InMemoryRateLimitStore,
  type RateLimitRule,
  type RateLimitStore
} from "../src/auth/auth-rate-limit";

describe("authentication abuse controls", () => {
  it("enforces send email 5/hour and 10/day", async () => {
    let now = 1_800_000_000_000;
    const limiter = createLimiter(() => now);
    for (let index = 0; index < 5; index += 1) {
      await limiter.enforce("send", identity("student@example.com", `ip-${index}`, `device-${index}`));
    }
    await expectLimited(limiter.enforce("send", identity("student@example.com", "new-ip", "new-device")));

    now += 3_600_001;
    for (let index = 0; index < 5; index += 1) {
      await limiter.enforce("send", identity("student@example.com", `later-ip-${index}`, `later-device-${index}`));
    }
    await expectLimited(limiter.enforce("send", identity("student@example.com", "last-ip", "last-device")));
  });

  it("uses a sliding window across fixed-clock boundaries with an accurate retry delay", async () => {
    let now = 3_599_999;
    const limiter = createLimiter(() => now);
    for (let index = 0; index < 5; index += 1) {
      await limiter.enforce("send", identity("student@example.com", `ip-${index}`, `device-${index}`));
    }

    now = 3_600_001;
    const failure = await limiter
      .enforce("send", identity("student@example.com", "new-ip", "new-device"))
      .catch((error) => error);
    expect(failure).toBeInstanceOf(AuthRateLimitException);
    expect((failure as AuthRateLimitException).retryAfterSeconds).toBe(3_600);

    now = 7_199_999;
    await expect(
      limiter.enforce("send", identity("student@example.com", "last-ip", "last-device"))
    ).resolves.toBeUndefined();
  });

  it("does not consume any dimension when one sliding-window rule is denied", async () => {
    const store = new InMemoryRateLimitStore(() => 10_000);
    const blocked = { key: "blocked", dimension: "blocked", limit: 1, windowSeconds: 60 };
    const untouched = { key: "untouched", dimension: "untouched", limit: 1, windowSeconds: 60 };
    await expect(store.consume([blocked])).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    await expect(store.consume([blocked, untouched])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 60
    });
    await expect(store.consume([untouched])).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("enforces send device 10/hour, IP 30/hour, and global 100/minute", async () => {
    await expectNthDenied("send", 11, (index) => identity(`device-${index}@example.com`, `ip-${index}`, "same-device"));
    await expectNthDenied("send", 31, (index) => identity(`ip-${index}@example.com`, "same-ip", `device-${index}`));
    await expectNthDenied("send", 101, (index) => identity(`global-${index}@example.com`, `ip-${index}`, `device-${index}`));
  });

  it("enforces verify email 15/15m, device 30/15m, IP 100/15m, and global 300/minute", async () => {
    await expectNthDenied("verify", 16, (index) => identity("student@example.com", `ip-${index}`, `device-${index}`));
    await expectNthDenied("verify", 31, (index) => identity(`device-${index}@example.com`, `ip-${index}`, "same-device"));
    await expectNthDenied("verify", 101, (index) => identity(`ip-${index}@example.com`, "same-ip", `device-${index}`));
    await expectNthDenied("verify", 301, (index) => identity(`global-${index}@example.com`, `ip-${index}`, `device-${index}`));
  });

  it("hashes email, IP, and device keys and never relies on device alone", async () => {
    const captured: RateLimitRule[][] = [];
    const store: RateLimitStore = {
      async consume(rules) {
        captured.push(rules);
        return { allowed: true, retryAfterSeconds: 0 };
      }
    };
    const limiter = new AuthRateLimiter({
      store,
      identifierHashSecret: "identifier-secret",
      nodeEnv: "production"
    });
    await limiter.enforce("send", identity("student@example.com", "203.0.113.5", "550e8400-e29b-41d4-a716-446655440000"));

    const keys = captured[0].map((rule) => rule.key).join(" ");
    expect(keys).not.toContain("student@example.com");
    expect(keys).not.toContain("203.0.113.5");
    expect(keys).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(captured[0].map((rule) => rule.dimension)).toEqual(["email-hour", "email-day", "device-hour", "ip-hour", "global-minute"]);
  });

  it("always creates a device bucket and falls back to the validated client IP", async () => {
    const captured: RateLimitRule[][] = [];
    const store: RateLimitStore = {
      async consume(rules) {
        captured.push(rules);
        return { allowed: true, retryAfterSeconds: 0 };
      }
    };
    const limiter = new AuthRateLimiter({
      store,
      identifierHashSecret: "identifier-secret",
      nodeEnv: "production"
    });

    await limiter.enforce("send", identity("first@example.com", "203.0.113.5", undefined));
    await limiter.enforce("send", identity("second@example.com", "203.0.113.5", undefined));

    const firstDevice = captured[0].find((rule) => rule.dimension === "device-hour");
    const secondDevice = captured[1].find((rule) => rule.dimension === "device-hour");
    expect(firstDevice).toBeDefined();
    expect(secondDevice?.key).toBe(firstDevice?.key);
  });

  it("fails closed in production and open outside production when the store is unavailable", async () => {
    const unavailableStore: RateLimitStore = {
      async consume() {
        throw new Error("connection details must not escape");
      }
    };
    const production = new AuthRateLimiter({
      store: unavailableStore,
      identifierHashSecret: "identifier-secret",
      nodeEnv: "production"
    });
    const development = new AuthRateLimiter({
      store: unavailableStore,
      identifierHashSecret: "identifier-secret",
      nodeEnv: "development"
    });

    const failure = await production.enforce("send", identity("a@b.co", "127.0.0.1", undefined)).catch((error) => error);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toMatchObject({ code: "AUTH_DELIVERY_UNAVAILABLE" });
    expect(JSON.stringify((failure as ServiceUnavailableException).getResponse())).not.toContain("connection details");
    await expect(development.enforce("send", identity("a@b.co", "127.0.0.1", undefined))).resolves.toBeUndefined();
  });

  it("uses only the framework-parsed validated IP and normalizes device UUIDs", () => {
    const request = {
      ip: "::ffff:203.0.113.9",
      headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.8", "x-device-id": "550e8400-e29b-41d4-a716-446655440000" }
    };
    expect(getRequestIdentity(request)).toEqual({
      ip: "203.0.113.9",
      deviceId: "550e8400-e29b-41d4-a716-446655440000"
    });
    expect(
      getRequestIdentity({ ip: "not-an-ip", headers: { "x-device-id": "not-a-uuid" } })
    ).toEqual({ ip: "unknown", deviceId: undefined });
    expect(
      getRequestIdentity({ ip: "2001:0DB8:0000:0000:0000:0000:0000:0001", headers: {} }).ip
    ).toBe("2001:db8::1");
    expect(getRequestIdentity({ ip: "0:0:0:0:0:ffff:cb00:7109", headers: {} }).ip).toBe("203.0.113.9");
  });
});

function identity(email: string, ip: string, deviceId: string | undefined) {
  return { email, ip, deviceId };
}

function createLimiter(now: () => number = () => 1_800_000_000_000) {
  return new AuthRateLimiter({
    store: new InMemoryRateLimitStore(now),
    identifierHashSecret: "identifier-secret",
    nodeEnv: "production"
  });
}

async function expectNthDenied(
  action: "send" | "verify",
  deniedAttempt: number,
  input: (index: number) => ReturnType<typeof identity>
) {
  const limiter = createLimiter();
  for (let index = 1; index < deniedAttempt; index += 1) await limiter.enforce(action, input(index));
  await expectLimited(limiter.enforce(action, input(deniedAttempt)));
}

async function expectLimited(promise: Promise<void>) {
  const failure = await promise.catch((error) => error);
  expect(failure).toBeInstanceOf(HttpException);
  expect((failure as HttpException).getStatus()).toBe(429);
  expect((failure as HttpException).getResponse()).toMatchObject({ code: "AUTH_RATE_LIMITED" });
  expect((failure as { retryAfterSeconds?: number }).retryAfterSeconds).toBeGreaterThan(0);
}
