import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { ValkeyRoommateMessageRateLimiter } from "../src/roommate-conversations/roommate-message-rate-limit";

const valkeyUrl = process.env.VALKEY_URL;
const describeValkey = process.env.RUN_VALKEY_SMOKE === "1" && valkeyUrl ? describe : describe.skip;

describeValkey("shared message quotas on real Valkey", () => {
  let client: ReturnType<typeof createClient>;
  let limiter: ValkeyRoommateMessageRateLimiter;
  const keys = new Set<string>();

  beforeAll(async () => {
    client = createClient({ url: valkeyUrl, disableOfflineQueue: true,
      socket: { connectTimeout: 1_000, reconnectStrategy: false } });
    client.on("error", () => undefined);
    await client.connect();
    limiter = new ValkeyRoommateMessageRateLimiter(client);
  });
  afterEach(async () => { if (keys.size) await client.del([...keys]); keys.clear(); });
  afterAll(async () => { if (client?.isOpen) client.destroy(); });

  it("atomically caps an actor across both conversation types and preserves another actor", async () => {
    const userId = `message-smoke-${randomUUID()}`;
    for (let index = 0; index < 100; index += 1) {
      await consume(userId, index % 2 ? `deal:${index}` : `roommate-${index}`);
    }
    await expect(consume(userId, "deal:fresh")).rejects.toMatchObject({ status: 429 });
    await expect(consume(`message-smoke-${randomUUID()}`, "deal:fresh")).resolves.toBeUndefined();
    expect(await client.zCard(actorKey(userId))).toBe(100);
    expect(await client.zCard(conversationKey(userId, "deal:fresh"))).toBe(0);
  });

  it("does not spend actor capacity when the conversation is full", async () => {
    const userId = `message-smoke-${randomUUID()}`;
    for (let index = 0; index < 20; index += 1) await consume(userId, "full");
    await expect(consume(userId, "full")).rejects.toMatchObject({ status: 429 });
    expect(await client.zCard(actorKey(userId))).toBe(20);
    await expect(consume(userId, "available")).resolves.toBeUndefined();
    expect(await client.zCard(actorKey(userId))).toBe(21);
  });

  it("expires both sliding-window scopes using server time without sleeping", async () => {
    const userId = `message-smoke-${randomUUID()}`;
    await consume(userId, "expired");
    const serverTime = await client.sendCommand(["TIME"]) as string[];
    const expiredScore = Number(serverTime[0]) * 1_000 + Math.floor(Number(serverTime[1]) / 1_000) - 60_001;
    for (const key of [actorKey(userId), conversationKey(userId, "expired")]) {
      await client.del(key);
      await client.zAdd(key, Array.from({ length: 100 }, (_, index) => ({ score: expiredScore, value: String(index) })));
    }
    await expect(consume(userId, "expired")).resolves.toBeUndefined();
    expect(await client.zCard(actorKey(userId))).toBe(1);
    expect(await client.zCard(conversationKey(userId, "expired"))).toBe(1);
  });

  function actorKey(userId: string) { return `roommate-message-rate-limit:{${userId}}:actor`; }
  function conversationKey(userId: string, conversationId: string) {
    return `roommate-message-rate-limit:{${userId}}:conversation:${conversationId}`;
  }
  function consume(userId: string, conversationId: string) {
    keys.add(actorKey(userId));
    keys.add(conversationKey(userId, conversationId));
    return limiter.consume({ userId, conversationId });
  }
});
