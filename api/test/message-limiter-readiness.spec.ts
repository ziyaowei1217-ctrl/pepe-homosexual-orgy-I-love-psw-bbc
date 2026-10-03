import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { HealthService } from "../src/health/health.service";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { createRoommateMessageRateLimiter } from "../src/roommate-conversations/roommate-message-rate-limit";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("message limiter readiness recovery", () => {
  it("restores readiness on a drained production replica without sending or spending message quota", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const health = new MessagingInfrastructureHealth();
    health.markDistributed("realtime");
    const failed = client({ eval: vi.fn().mockRejectedValue(new Error("provider fault")) });
    const recovered = client();
    createRoommateMessageRateLimiter({
      valkeyUrl: "rediss://cache.example.com", health, retryCooldownMs: 0, logger: { warn: vi.fn() },
      clientFactory: vi.fn().mockReturnValueOnce(failed).mockReturnValue(recovered)
    });
    const auth = new AuthInfrastructureHealth();
    auth.registerProbe(async () => undefined);
    const readiness = new HealthService({ $queryRaw: async () => [] } as never, health, auth);

    await expect(readiness.ready()).rejects.toMatchObject({ status: 503 });
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    await expect(readiness.ready()).resolves.toMatchObject({ status: "ok" });
    await expect(readiness.ready()).resolves.toMatchObject({ status: "ok" });
    for (const command of [...failed.eval.mock.calls, ...recovered.eval.mock.calls]) {
      expect(command).toEqual(["return 1", { keys: [], arguments: [] }]);
    }
  });

  it("bounds stalled probes, observes the recovery cooldown and uses a fresh client afterwards", async () => {
    vi.useFakeTimers();
    const health = new MessagingInfrastructureHealth();
    const failed = client({ eval: vi.fn(() => new Promise<never>(() => undefined)) });
    const recovered = client();
    const factory = vi.fn().mockReturnValueOnce(failed).mockReturnValue(recovered);
    createRoommateMessageRateLimiter({
      valkeyUrl: "rediss://cache.example.com", health, operationTimeoutMs: 100, retryCooldownMs: 500,
      logger: { warn: vi.fn() }, clientFactory: factory
    });
    const pending = health.refresh();
    await vi.advanceTimersByTimeAsync(100);
    await pending;
    expect(health.snapshot().messageRateLimit).toMatchObject({ status: "degraded", reason: "timeout" });
    await health.refresh();
    expect(factory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(500);
    await health.refresh();
    expect(factory).toHaveBeenCalledTimes(2);
    expect(health.snapshot().messageRateLimit).toEqual({ status: "ok", mode: "distributed" });
  });
});

function client(overrides = {}) {
  return {
    isOpen: true, isReady: true,
    connect: vi.fn().mockResolvedValue(undefined),
    eval: vi.fn().mockResolvedValue(1),
    destroy: vi.fn(), on: vi.fn(), ...overrides
  };
}
