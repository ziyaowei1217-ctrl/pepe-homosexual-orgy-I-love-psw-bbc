import { describe, expect, it } from "vitest";
import { LocalRoommateMessageRateLimiter } from "../src/roommate-conversations/roommate-message-rate-limit";

describe("local message limiter retention", () => {
  it("reclaims inactive conversations while retaining the quota of an active conversation", async () => {
    let now = 0;
    const limiter = new LocalRoommateMessageRateLimiter({ now: () => now, limit: 1 });
    for (let index = 0; index < 1_000; index += 1) {
      await limiter.consume({ userId: "user", conversationId: `old-${index}` });
    }
    now = 30_000;
    const active = { userId: "user", conversationId: "active" };
    await limiter.consume(active);
    now = 60_001;
    await expect(limiter.consume(active)).rejects.toMatchObject({ status: 429 });
    const retained = (limiter as unknown as { timestamps: Map<string, number[]> }).timestamps;
    expect(retained.size).toBe(1);
    now = 90_001;
    await expect(limiter.consume(active)).resolves.toBeUndefined();
  });
});
