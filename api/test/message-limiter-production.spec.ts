import { describe, expect, it, vi } from "vitest";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { createRoommateMessageRateLimiter } from "../src/roommate-conversations/roommate-message-rate-limit";

describe("production shared message quota policy", () => {
  it("refuses missing or unverified infrastructure before accepting messages", () => {
    for (const valkeyUrl of ["", "redis://cache.example.test", "rediss://cache.example.test?tls=false"]) {
      expect(() => createRoommateMessageRateLimiter({ nodeEnv: "production", valkeyUrl })).toThrow("VALKEY_URL");
    }
  });
  it("fails closed after an outage, preserves the cooldown, and recovers on a fresh client", async () => {
    const health = new MessagingInfrastructureHealth();
    const failed = client(vi.fn().mockRejectedValue(new Error("sensitive provider error")));
    const recovered = client(vi.fn().mockImplementation(async (script: string) => script === "return 1" ? 1 : [1, 0]));
    const factory = vi.fn().mockReturnValueOnce(failed).mockReturnValue(recovered);
    let time = 0;
    const limiter = createRoommateMessageRateLimiter({ nodeEnv: "production", valkeyUrl: "rediss://cache.example.test", health,
      now: () => time, retryCooldownMs: 100, clientFactory: factory, logger: { warn: vi.fn() } });
    const request = { userId: "actor", conversationId: "conversation" };
    await expect(limiter.consume(request)).rejects.toMatchObject({ status: 503 });
    await expect(limiter.consume(request)).rejects.toMatchObject({ status: 503 });
    expect(failed.eval).toHaveBeenCalledTimes(1); expect(factory).toHaveBeenCalledTimes(1);
    expect(health.snapshot().messageRateLimit.status).toBe("degraded");
    time = 100;
    await health.refresh();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(health.snapshot().messageRateLimit).toEqual({ status: "ok", mode: "distributed" });
    await expect(limiter.consume(request)).resolves.toBeUndefined();
  });
});
function client(evaluate: ReturnType<typeof vi.fn>) {
  return { isOpen: true, isReady: true, connect: vi.fn().mockResolvedValue(undefined), eval: evaluate,
    destroy: vi.fn(), on: vi.fn() };
}
