import { HttpException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  createRoommateMessageRateLimiter,
  LocalRoommateMessageRateLimiter,
  ValkeyRoommateMessageRateLimiter
} from "../src/roommate-conversations/roommate-message-rate-limit";

describe("roommate message rate limiter selection", () => {
  it("does not create or connect a Valkey client when VALKEY_URL is absent", () => {
    const clientFactory = vi.fn();

    const limiter = createRoommateMessageRateLimiter({ valkeyUrl: "", clientFactory });

    expect(limiter).toBeInstanceOf(LocalRoommateMessageRateLimiter);
    expect(clientFactory).not.toHaveBeenCalled();
  });

  it("uses one atomic Valkey sliding-window evaluation with the 20 per 60 second policy", async () => {
    const client = {
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn().mockResolvedValue([1, 0]),
      quit: vi.fn()
    };
    const limiter = createRoommateMessageRateLimiter({
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: () => client
    });

    await limiter.consume({ userId: "user-a", conversationId: "conversation-a-b" });

    expect(limiter).toBeInstanceOf(ValkeyRoommateMessageRateLimiter);
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.eval).toHaveBeenCalledTimes(1);
    const [, options] = client.eval.mock.calls[0] as [string, { keys: string[]; arguments: string[] }];
    expect(options.keys).toEqual(["roommate-message-rate-limit:user-a:conversation-a-b"]);
    expect(options.arguments.slice(0, 2)).toEqual(["20", "60000"]);
    expect(options.arguments[2]).toMatch(/^[0-9a-f-]{36}$/);
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

async function rejectionOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to reject");
}
