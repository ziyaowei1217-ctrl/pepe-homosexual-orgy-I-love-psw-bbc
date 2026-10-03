import { afterEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => redis);

import { AuthRateLimiter, InMemoryRateLimitStore } from "../src/auth/auth-rate-limit";
import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { AuthValkeyTimeoutError, createRateLimitStore, ValkeyRateLimitStore } from "../src/auth/valkey-rate-limit-store";

afterEach(() => vi.useRealTimers());

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

  it("replaces a failed connection for a later authentication attempt", async () => {
    const failed = commandClient({ isOpen: false, connect: vi.fn().mockRejectedValue(new Error("temporarily unavailable")) });
    const recovered = commandClient();
    const store = new ValkeyRateLimitStore(failed, { clientFactory: () => recovered });

    await expect(store.consume(rules)).rejects.toThrow("temporarily unavailable");
    await expect(store.consume(rules)).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    expect(recovered.eval).toHaveBeenCalledTimes(1);
  });

  it("rejects missing and unusable production Valkey instead of weakening limits to memory", () => {
    for (const valkeyUrl of ["", "rediss://cache.example.com/not-a-db", "redis://cache.example.com:6379"]) {
      expect(() => createRateLimitStore({ nodeEnv: "production", valkeyUrl })).toThrow("VALKEY_URL");
    }
    expect(createRateLimitStore({ nodeEnv: "test" })).toBeInstanceOf(InMemoryRateLimitStore);
  });

  it("rejects driver construction failures without exposing credential-bearing errors", () => {
    const url = "rediss://user:construction-secret@cache.example.com";
    redis.createClient.mockReset();
    redis.createClient.mockImplementation(() => { throw new TypeError(`Cannot connect to ${url}`); });
    expect(() => createRateLimitStore({ nodeEnv: "production", valkeyUrl: url }))
      .toThrow("Production Valkey client configuration is invalid");
  });

  it.each(["connect", "eval"] as const)("fails closed within the auth budget when %s hangs and recovers with a fresh client", async operation => {
    vi.useFakeTimers();
    const failed = commandClient({
      ...(operation === "connect" ? { isOpen: false } : {}),
      [operation]: vi.fn(() => new Promise<never>(() => undefined))
    });
    const recovered = commandClient();
    const factory = vi.fn().mockReturnValueOnce(failed).mockReturnValue(recovered);
    const store = createRateLimitStore({ nodeEnv: "production", valkeyUrl: "rediss://cache.example.com", clientFactory: factory, operationTimeoutMs: 100 });
    const limiter = new AuthRateLimiter({ store, identifierHashSecret: "test-identifier", nodeEnv: "production" });
    const attempt = limiter.enforce("verify", "LOGIN", { email: "user@example.com", ip: "127.0.0.1" });
    const rejected = expect(attempt).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    await expect(store.consume(rules)).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight connection across concurrent auth requests", async () => {
    let finish: () => void = () => undefined;
    const client = commandClient({ isOpen: false, isReady: false });
    client.connect.mockImplementation(() => {
      client.isOpen = true;
      return new Promise<void>(resolve => { finish = () => { client.isReady = true; resolve(); }; });
    });
    const store = new ValkeyRateLimitStore(client);
    const first = store.consume(rules);
    await Promise.resolve();
    const second = store.consume(rules);
    finish();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it("bounds shutdown even when a legacy client QUIT never resolves", async () => {
    vi.useFakeTimers();
    const store = new ValkeyRateLimitStore(commandClient({ destroy: undefined, quit: vi.fn(() => new Promise<never>(() => undefined)) }), { operationTimeoutMs: 100 });
    const close = store.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(100);
    await expect(close).resolves.toBeUndefined();
    await expect(store.consume(rules)).rejects.toThrow("closed");
  });

  it.each([[1, NaN], [2, 0], ["1", 0], [0, 0]])("rejects malformed auth limit responses %j", async (allowed, retry) => {
    const client = commandClient({ eval: vi.fn().mockResolvedValue([allowed, retry]) });
    await expect(new ValkeyRateLimitStore(client).consume(rules)).rejects.toThrow("Invalid Valkey rate limit response");
    expect(client.destroy).toHaveBeenCalledTimes(1);
  });

  it("invalidates a timed-out health PING so the next check can recover", async () => {
    vi.useFakeTimers();
    const failed = commandClient({ ping: vi.fn(() => new Promise<never>(() => undefined)) });
    const recovered = commandClient();
    const store = new ValkeyRateLimitStore(failed, { clientFactory: () => recovered, operationTimeoutMs: 100 });
    const rejected = expect(store.checkReadiness()).rejects.toBeInstanceOf(AuthValkeyTimeoutError);
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    await expect(store.checkReadiness()).resolves.toBeUndefined();
  });

  it("registers the production store's live probe with readiness and recovers after a provider failure", async () => {
    const health = new AuthInfrastructureHealth();
    const failed = commandClient({ ping: vi.fn().mockResolvedValueOnce("PONG").mockRejectedValueOnce(new Error("provider fault")) });
    const recovered = commandClient();
    createRateLimitStore({
      nodeEnv: "production", valkeyUrl: "rediss://cache.example.com", health,
      clientFactory: vi.fn().mockReturnValueOnce(failed).mockReturnValue(recovered)
    });
    await expect(health.check()).resolves.toEqual({ status: "ok", mode: "distributed" });
    await expect(health.check()).resolves.toEqual({ status: "error", mode: "distributed" });
    expect(failed.destroy).toHaveBeenCalledTimes(1);
    await expect(health.check()).resolves.toEqual({ status: "ok", mode: "distributed" });
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

    const store = createRateLimitStore({ nodeEnv: "production", valkeyUrl: "rediss://valkey.internal:6379" });

    expect(store).toBeInstanceOf(ValkeyRateLimitStore);
    expect(redis.createClient).toHaveBeenCalledWith({
      url: "rediss://valkey.internal:6379",
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
        valkeyUrl: "rediss://internal.example:6379",
        clientFactory: () => client
      })
    ).toBeInstanceOf(ValkeyRateLimitStore);
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});

const rules = [{ key: "key", dimension: "global", limit: 1, windowSeconds: 60 }];

function commandClient(overrides = {}) {
  return {
    isOpen: true,
    isReady: true,
    connect: vi.fn().mockResolvedValue(undefined),
    eval: vi.fn().mockResolvedValue([1, 0]),
    ping: vi.fn().mockResolvedValue("PONG"),
    destroy: vi.fn(),
    quit: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };
}
