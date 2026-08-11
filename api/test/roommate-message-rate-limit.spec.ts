import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import {
  createRoommateMessageRateLimiter,
  LocalRoommateMessageRateLimiter,
  ResilientRoommateMessageRateLimiter,
  ValkeyRoommateMessageRateLimiter
} from "../src/roommate-conversations/roommate-message-rate-limit";

describe("roommate message rate limiter selection", () => {
  it("does not create or connect a Valkey client when VALKEY_URL is absent", () => {
    const clientFactory = vi.fn();
    const health = new MessagingInfrastructureHealth();

    const limiter = createRoommateMessageRateLimiter({ valkeyUrl: "", clientFactory, health });

    expect(limiter).toBeInstanceOf(LocalRoommateMessageRateLimiter);
    expect(clientFactory).not.toHaveBeenCalled();
    expect(health.snapshot().messageRateLimit).toEqual({ status: "ok", mode: "single-instance" });
  });

  it("uses one atomic Valkey sliding-window evaluation with the 20 per 60 second policy", async () => {
    const client = {
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn().mockResolvedValue([1, 0]),
      quit: vi.fn()
    };
    const health = new MessagingInfrastructureHealth();
    const limiter = createRoommateMessageRateLimiter({
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: () => client,
      health
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(limiter).toBeInstanceOf(ResilientRoommateMessageRateLimiter);
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.eval).toHaveBeenCalledTimes(1);
    const [, options] = client.eval.mock.calls[0] as [string, { keys: string[]; arguments: string[] }];
    expect(options.keys).toEqual(["roommate-message-rate-limit:user-a:conversation-a-b"]);
    expect(options.arguments.slice(0, 2)).toEqual(["20", "60000"]);
    expect(options.arguments[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(health.snapshot().messageRateLimit).toEqual({ status: "ok", mode: "distributed" });
  });

  it("returns the atomic script retry delay when the window is full", async () => {
    const limiter = new ValkeyRoommateMessageRateLimiter({
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn().mockResolvedValue([0, 41])
    });

    const rejection = await rejectionOf(
      limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" })
    );

    expect(rejection).toBeInstanceOf(HttpException);
    expect((rejection as HttpException).getStatus()).toBe(429);
    expect((rejection as HttpException).getResponse()).toMatchObject({
      message: "Roommate message rate limit exceeded",
      retryAfterSeconds: 41
    });
  });

  it("connects lazily and closes its command client during shutdown", async () => {
    const client = {
      isOpen: false,
      connect: vi.fn().mockImplementation(function (this: { isOpen: boolean }) {
        this.isOpen = true;
      }),
      eval: vi.fn().mockResolvedValue([1, 0]),
      quit: vi.fn().mockImplementation(function (this: { isOpen: boolean }) {
        this.isOpen = false;
      })
    };
    const limiter = new ValkeyRoommateMessageRateLimiter(client);

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });
    await limiter.onModuleDestroy();

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.quit).toHaveBeenCalledTimes(1);
  });

  it("destroys a connecting command client during shutdown without waiting for it to open", async () => {
    const client = {
      isOpen: false,
      connect: vi.fn().mockReturnValue(new Promise(() => undefined)),
      eval: vi.fn(),
      destroy: vi.fn()
    };
    const limiter = new ValkeyRoommateMessageRateLimiter(client);

    await limiter.onModuleDestroy();

    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a reconnecting command client without waiting for queued QUIT", async () => {
    const client = {
      isOpen: true,
      isReady: false,
      connect: vi.fn(),
      eval: vi.fn(),
      quit: vi.fn().mockReturnValue(new Promise(() => undefined)),
      destroy: vi.fn()
    };
    const limiter = new ValkeyRoommateMessageRateLimiter(client);

    const result = await Promise.race([
      limiter.onModuleDestroy().then(() => "closed" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50))
    ]);

    expect(result).toBe("closed");
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys a ready command client before QUIT can enter a hung closed state", async () => {
    const client = {
      isOpen: true,
      isReady: true,
      connect: vi.fn(),
      eval: vi.fn(),
      quit: vi.fn().mockImplementation(function (this: { isOpen: boolean }) {
        this.isOpen = false;
        return new Promise(() => undefined);
      }),
      destroy: vi.fn()
    };
    const limiter = new ValkeyRoommateMessageRateLimiter(client);

    const result = await Promise.race([
      limiter.onModuleDestroy().then(() => "closed" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50))
    ]);

    expect(result).toBe("closed");
    expect(client.quit).not.toHaveBeenCalled();
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });
});

describe("resilient roommate message rate limiter", () => {
  it("falls back to the bounded local limiter when Valkey connect fails", async () => {
    let now = 1_000;
    const client = {
      isOpen: false,
      connect: vi.fn().mockRejectedValue(new Error("socket closed")),
      eval: vi.fn()
    };
    const health = new MessagingInfrastructureHealth();
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed: new ValkeyRoommateMessageRateLimiter(client),
      local: new LocalRoommateMessageRateLimiter({ now: () => now, limit: 1 }),
      health,
      now: () => now,
      logger: silentLogger
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });
    const rejection = await rejectionOf(limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" }));

    expect(rejection).toBeInstanceOf(HttpException);
    expect((rejection as HttpException).getStatus()).toBe(429);
    expect(health.snapshot().messageRateLimit).toMatchObject({
      status: "degraded",
      mode: "local-fallback",
      reason: "connection"
    });
  });

  it("falls back when Valkey evaluation times out or returns a malformed protocol response", async () => {
    vi.useFakeTimers();
    try {
      let now = 1_000;
      const timeoutClient = {
        isOpen: true,
        connect: vi.fn(),
        eval: vi.fn().mockReturnValue(new Promise(() => undefined))
      };
      const timeoutHealth = new MessagingInfrastructureHealth();
      const timeoutLimiter = new ResilientRoommateMessageRateLimiter({
        distributed: new ValkeyRoommateMessageRateLimiter(timeoutClient, { operationTimeoutMs: 10 }),
        local: new LocalRoommateMessageRateLimiter({ now: () => now, limit: 1 }),
        health: timeoutHealth,
        now: () => now,
        logger: silentLogger
      });

      const timedConsume = timeoutLimiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });
      await vi.advanceTimersByTimeAsync(10);
      await timedConsume;

      expect(timeoutHealth.snapshot().messageRateLimit).toMatchObject({
        status: "degraded",
        mode: "local-fallback",
        reason: "timeout"
      });

      const protocolHealth = new MessagingInfrastructureHealth();
      const protocolLimiter = new ResilientRoommateMessageRateLimiter({
        distributed: new ValkeyRoommateMessageRateLimiter({
          isOpen: true,
          connect: vi.fn(),
          eval: vi.fn().mockResolvedValue({ allowed: true })
        }),
        local: new LocalRoommateMessageRateLimiter({ now: () => now, limit: 1 }),
        health: protocolHealth,
        now: () => now,
        logger: silentLogger
      });

      await protocolLimiter.consume({ userId: "user-b", conversationId: "conversation-b-c" });

      expect(protocolHealth.snapshot().messageRateLimit).toMatchObject({
        status: "degraded",
        mode: "local-fallback",
        reason: "protocol"
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not attempt another Valkey operation before the recovery cooldown expires", async () => {
    let now = 1_000;
    const client = {
      isOpen: false,
      connect: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")),
      eval: vi.fn()
    };
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed: new ValkeyRoommateMessageRateLimiter(client),
      local: new LocalRoommateMessageRateLimiter({ now: () => now }),
      health: new MessagingInfrastructureHealth(),
      now: () => now,
      retryCooldownMs: 30_000,
      logger: silentLogger
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });
    now += 29_999;
    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.eval).not.toHaveBeenCalled();
  });

  it("returns a genuine distributed 429 without consuming local fallback capacity", async () => {
    let now = 1_000;
    const distributed = {
      consume: vi.fn().mockRejectedValueOnce(rateLimitError()).mockRejectedValueOnce(new Error("socket closed"))
    } as unknown as ValkeyRoommateMessageRateLimiter;
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed,
      local: new LocalRoommateMessageRateLimiter({ now: () => now, limit: 1 }),
      health: new MessagingInfrastructureHealth(),
      now: () => now,
      retryCooldownMs: 10,
      logger: silentLogger
    });

    const rejection = await rejectionOf(limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" }));
    now += 10;
    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(rejection).toBeInstanceOf(HttpException);
    expect((rejection as HttpException).getStatus()).toBe(429);
  });

  it("marks the limiter distributed again after a successful recovery probe", async () => {
    let now = 1_000;
    const client = {
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn().mockRejectedValueOnce(new Error("socket closed")).mockResolvedValueOnce([1, 0])
    };
    const health = new MessagingInfrastructureHealth();
    health.markDistributed("messageRateLimit");
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed: new ValkeyRoommateMessageRateLimiter(client),
      local: new LocalRoommateMessageRateLimiter({ now: () => now }),
      health,
      now: () => now,
      retryCooldownMs: 30_000,
      logger: silentLogger
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });
    expect(health.snapshot().messageRateLimit).toMatchObject({ status: "degraded", mode: "local-fallback" });
    now += 30_000;
    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(health.snapshot().messageRateLimit).toEqual({ status: "ok", mode: "distributed" });
  });

  it("logs only component, mode, and sanitized reason when Valkey fails", async () => {
    const warnings: Record<string, string>[] = [];
    const leaked = "victim@example.com token=secret body={private} redis://user:pass@host:6379";
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed: new ValkeyRoommateMessageRateLimiter({
        isOpen: true,
        connect: vi.fn(),
        eval: vi.fn().mockRejectedValue(new Error(`socket closed ${leaked}`))
      }),
      local: new LocalRoommateMessageRateLimiter(),
      health: new MessagingInfrastructureHealth(),
      logger: { warn: (warning) => warnings.push(warning) }
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(warnings).toEqual([{ component: "messageRateLimit", mode: "local-fallback", reason: "connection" }]);
    expect(JSON.stringify(warnings)).not.toContain("victim@example.com");
    expect(JSON.stringify(warnings)).not.toContain("secret");
    expect(JSON.stringify(warnings)).not.toContain("private");
    expect(JSON.stringify(warnings)).not.toContain("redis://");
    expect(JSON.stringify(warnings)).toContain('"reason":"connection"');
  });

  it("delegates shutdown to the distributed limiter", async () => {
    const client = {
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn(),
      destroy: vi.fn()
    };
    const limiter = new ResilientRoommateMessageRateLimiter({
      distributed: new ValkeyRoommateMessageRateLimiter(client),
      local: new LocalRoommateMessageRateLimiter(),
      health: new MessagingInfrastructureHealth()
    });

    await limiter.onModuleDestroy();

    expect(client.destroy).toHaveBeenCalledTimes(1);
  });
});

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}

function rateLimitError() {
  return new HttpException({ statusCode: 429, message: "Roommate message rate limit exceeded" }, 429);
}

const silentLogger = { warn: () => undefined };
