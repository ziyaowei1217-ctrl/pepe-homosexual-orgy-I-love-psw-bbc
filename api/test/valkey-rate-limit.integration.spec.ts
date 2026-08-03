import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ValkeyRateLimitStore } from "../src/auth/valkey-rate-limit-store";

const runValkeySmoke = process.env.RUN_VALKEY_SMOKE === "1";
const valkeyUrl = process.env.VALKEY_URL;
const describeValkey = runValkeySmoke && valkeyUrl ? describe : describe.skip;
const suiteName = runValkeySmoke && !valkeyUrl
  ? "Valkey rate-limit integration (skipped: VALKEY_URL is missing)"
  : "Valkey rate-limit integration";

describeValkey(suiteName, () => {
  let client: ReturnType<typeof createClient>;
  let store: ValkeyRateLimitStore;
  const keys = new Set<string>();

  beforeAll(async () => {
    client = createClient({ url: valkeyUrl });
    store = new ValkeyRateLimitStore(client);
    client.on("error", () => undefined);
    await client.connect();
  });

  afterEach(async () => {
    if (keys.size > 0) await client.del([...keys]);
    keys.clear();
  });

  afterAll(async () => {
    if (client.isOpen) await client.quit();
  });

  it("uses server time for a real sliding window across a clock boundary", async () => {
    const windowMs = 1_000;
    const key = smokeKey("boundary");
    const firstTimestamp = await consumeNearWindowEnd(key, windowMs);
    await wait(windowMs - (firstTimestamp % windowMs) + 30);

    const acrossBoundary = await store.consume([rule(key, 1, windowMs)]);
    expect(acrossBoundary.allowed).toBe(false);
    expect(acrossBoundary.retryAfterSeconds).toBe(1);

    const remainingMs = firstTimestamp + windowMs + 30 - (await redisNowMilliseconds());
    if (remainingMs > 0) await wait(remainingMs);
    await expect(store.consume([rule(key, 1, windowMs)])).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 0
    });
  });

  it("applies a multi-key decision atomically when one dimension is blocked", async () => {
    const blockedKey = smokeKey("blocked");
    const untouchedKey = smokeKey("untouched");

    await expect(store.consume([rule(blockedKey, 1, 5_000)])).resolves.toMatchObject({ allowed: true });
    await expect(
      store.consume([rule(blockedKey, 1, 5_000), rule(untouchedKey, 1, 5_000)])
    ).resolves.toMatchObject({ allowed: false });
    await expect(store.consume([rule(untouchedKey, 1, 5_000)])).resolves.toMatchObject({ allowed: true });
  });

  it("returns server-derived retry-after values until the oldest event expires", async () => {
    const key = smokeKey("retry-after");

    await expect(store.consume([rule(key, 1, 2_000)])).resolves.toMatchObject({ allowed: true });
    await expect(store.consume([rule(key, 1, 2_000)])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 2
    });
    await wait(1_100);
    await expect(store.consume([rule(key, 1, 2_000)])).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 1
    });
    await wait(1_000);
    await expect(store.consume([rule(key, 1, 2_000)])).resolves.toMatchObject({ allowed: true });
  });

  function smokeKey(label: string) {
    const key = `auth-smoke:${randomUUID()}:${label}`;
    keys.add(key);
    return key;
  }

  function rule(key: string, limit: number, windowMs: number) {
    return { key, dimension: "integration", limit, windowSeconds: windowMs / 1_000 };
  }

  async function redisNowMilliseconds() {
    const response = (await client.sendCommand(["TIME"])) as unknown as [string, string];
    return Number(response[0]) * 1_000 + Math.floor(Number(response[1]) / 1_000);
  }

  async function oldestScore(key: string) {
    const response = (await client.sendCommand(["ZRANGE", key, "0", "0", "WITHSCORES"])) as unknown as string[];
    if (response.length < 2) throw new Error("Expected a rate-limit event");
    return Number(response[1]);
  }

  async function consumeNearWindowEnd(key: string, windowMs: number) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await waitForWindowOffset(windowMs, 600, 700);
      await expect(store.consume([rule(key, 1, windowMs)])).resolves.toEqual({
        allowed: true,
        retryAfterSeconds: 0
      });
      const timestamp = await oldestScore(key);
      if (timestamp % windowMs >= 550) return timestamp;
      await client.del(key);
    }
    throw new Error("Could not position a rate-limit event near the server-time boundary");
  }

  async function waitForWindowOffset(windowMs: number, minimumOffsetMs: number, maximumOffsetMs: number) {
    while (true) {
      const timestamp = await redisNowMilliseconds();
      const offset = timestamp % windowMs;
      if (offset >= minimumOffsetMs && offset <= maximumOffsetMs) return;
      await wait(offset < minimumOffsetMs ? minimumOffsetMs - offset : windowMs - offset + minimumOffsetMs);
    }
  }
});

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
