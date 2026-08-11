import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => redis);

import { InMemoryRateLimitStore } from "../src/auth/auth-rate-limit";
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

  it("does not evaluate while an auth command client reports that it is not ready", async () => {
    const client = {
      isOpen: true,
      isReady: false,
      connect: vi.fn(),
      eval: vi.fn().mockResolvedValue([1, 0])
    };
    const store = new ValkeyRateLimitStore(client);

    await expect(
      store.consume([{ key: "key", dimension: "global", limit: 1, windowSeconds: 60 }])
    ).rejects.toThrow("Valkey command client is not ready");
    expect(client.eval).not.toHaveBeenCalled();
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

  it("uses the bounded in-memory store when production has no Valkey", async () => {
    const store = createRateLimitStore({ nodeEnv: "production", valkeyUrl: "" });
    const rule = { key: "auth:send:global-minute:all", dimension: "global-minute", limit: 1, windowSeconds: 60 };

    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
    await expect(store.consume([rule])).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(store.consume([rule])).resolves.toMatchObject({ allowed: false });
    expect(createRateLimitStore({ nodeEnv: "test" })).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it("contains credential-bearing malformed Valkey configuration in bounded local auth", () => {
    const credential = "auth-construction-secret";
    const malformedUrl = `redis://user:${credential}@[`;
    redis.createClient.mockReset();
    redis.createClient.mockImplementation(() => {
      throw Object.assign(new TypeError("Invalid URL"), { input: malformedUrl });
    });

    const store = createRateLimitStore({ nodeEnv: "production", valkeyUrl: malformedUrl });

    expect(store).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it("disables the default auth command client's offline queue", () => {
    redis.createClient.mockReset();
    const client = {
      isOpen: false,
      connect: vi.fn(),
      eval: vi.fn(),
      on: vi.fn()
    };
    redis.createClient.mockReturnValue(client);

    const store = createRateLimitStore({ nodeEnv: "production", valkeyUrl: "redis://valkey.internal:6379" });

    expect(store).toBeInstanceOf(ValkeyRateLimitStore);
    expect(redis.createClient).toHaveBeenCalledWith({
      url: "redis://valkey.internal:6379",
      disableOfflineQueue: true
    });
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
