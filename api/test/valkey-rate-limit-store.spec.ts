import { describe, expect, it, vi } from "vitest";

import { createRateLimitStore, ValkeyRateLimitStore } from "../src/auth/valkey-rate-limit-store";

describe("Valkey rate limit store", () => {
  it("atomically sends base keys and sliding-window milliseconds for server-time evaluation", async () => {
    const client = {
      isOpen: true,
      connect: vi.fn(),
      eval: vi.fn().mockResolvedValue([1, 0])
    };
    const store = new ValkeyRateLimitStore(client);

    await expect(
      store.consume([
        { key: "auth:send:email-hour:hash", dimension: "email-hour", limit: 5, windowSeconds: 3_600 },
        { key: "auth:send:global-minute:all", dimension: "global-minute", limit: 100, windowSeconds: 60 }
      ])
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });

    expect(client.connect).not.toHaveBeenCalled();
    expect(client.eval).toHaveBeenCalledTimes(1);
    const [, options] = client.eval.mock.calls[0] as [string, { keys: string[]; arguments: string[] }];
    expect(options.keys).toEqual([
      "auth:send:email-hour:hash",
      "auth:send:global-minute:all"
    ]);
    expect(options.arguments.slice(0, 4)).toEqual(["5", "3600000", "100", "60000"]);
    expect(options.arguments[4]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("connects lazily and returns the longest retry delay from the atomic script", async () => {
    const client = {
      isOpen: false,
      connect: vi.fn().mockImplementation(function (this: { isOpen: boolean }) {
        this.isOpen = true;
      }),
      eval: vi.fn().mockResolvedValue([0, 47])
    };
    const store = new ValkeyRateLimitStore(client);

    await expect(
      store.consume([{ key: "key", dimension: "global", limit: 1, windowSeconds: 60 }])
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 47 });
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("can reconnect after a transient initial connection failure", async () => {
    const client = {
      isOpen: false,
      connect: vi
        .fn()
        .mockRejectedValueOnce(new Error("temporarily unavailable"))
        .mockImplementationOnce(function (this: { isOpen: boolean }) {
          this.isOpen = true;
          return Promise.resolve();
        }),
      eval: vi.fn().mockResolvedValue([1, 0])
    };
    const store = new ValkeyRateLimitStore(client);
    const rules = [{ key: "key", dimension: "global", limit: 1, windowSeconds: 60 }];

    await expect(store.consume(rules)).rejects.toThrow("temporarily unavailable");
    await expect(store.consume(rules)).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(client.connect).toHaveBeenCalledTimes(2);
  });

  it("requires Valkey in production and uses memory outside production", () => {
    expect(() => createRateLimitStore({ nodeEnv: "production", valkeyUrl: "" })).toThrow(
      "VALKEY_URL is required in production"
    );
    expect(createRateLimitStore({ nodeEnv: "test" }).constructor.name).toBe("InMemoryRateLimitStore");
  });

  it("handles client error events without logging connection details", () => {
    const client = {
      isOpen: false,
      connect: vi.fn(),
      eval: vi.fn(),
      on: vi.fn()
    };
    expect(
      createRateLimitStore({
        nodeEnv: "production",
        valkeyUrl: "redis://internal.example:6379",
        clientFactory: () => client
      })
    ).toBeInstanceOf(ValkeyRateLimitStore);
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
