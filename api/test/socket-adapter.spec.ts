import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => redis);

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { createRoommateSocketAdapter } from "../src/roommate-conversations/socket-adapter";

describe("optional roommate Socket.IO Valkey adapter", () => {
  it("marks realtime single-instance when VALKEY_URL is absent", async () => {
    const clientFactory = vi.fn();
    const health = messagingHealth();
    health.markDistributed("realtime");

    const adapter = await createRoommateSocketAdapter(appContext(), { valkeyUrl: "", clientFactory, health });

    expect(adapter).toBeUndefined();
    expect(clientFactory).not.toHaveBeenCalled();
    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "single-instance" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("marks realtime distributed after both adapter clients connect", async () => {
    const health = messagingHealth();
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    let markPubConnected!: () => void;
    const pubConnected = new Promise<void>((resolve) => {
      markPubConnected = resolve;
    });
    let resolveSubConnection!: () => void;
    pubClient.connect.mockImplementation(function (this: { isOpen: boolean; isReady: boolean }) {
      this.isOpen = true;
      this.isReady = true;
      return Promise.resolve().then(() => markPubConnected());
    });
    subClient.connect.mockImplementation(function (this: { isOpen: boolean; isReady: boolean }) {
      return new Promise<void>((resolve) => {
        resolveSubConnection = () => {
          this.isOpen = true;
          this.isReady = true;
          resolve();
        };
      });
    });

    const adapterPromise = createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health
    });

    await pubConnected;
    await Promise.resolve();
    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "single-instance" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });

    resolveSubConnection();
    const adapter = await adapterPromise;

    expect(adapter).toBeDefined();
    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "distributed" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("connects distinct pub/sub clients and closes both during adapter disposal", async () => {
    const clients = [valkeyClient(), valkeyClient()];
    const clientFactory = vi.fn().mockImplementation(() => clients.shift());

    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory
    });

    expect(adapter).toBeDefined();
    expect(clientFactory).toHaveBeenCalledTimes(2);
    const createdClients = clientFactory.mock.results.map((result) => result.value as ReturnType<typeof valkeyClient>);
    expect(createdClients[0]).not.toBe(createdClients[1]);
    expect(createdClients[0].connect).toHaveBeenCalledTimes(1);
    expect(createdClients[1].connect).toHaveBeenCalledTimes(1);

    await adapter?.dispose();

    expect(createdClients[0].quit).not.toHaveBeenCalled();
    expect(createdClients[1].quit).not.toHaveBeenCalled();
    expect(createdClients[0].destroy).toHaveBeenCalledTimes(1);
    expect(createdClients[1].destroy).toHaveBeenCalledTimes(1);
  });

  it("logs sanitized connection fallback, closes opened clients, and permits HTTP startup after connection failure", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient({ connectError: new Error("socket connection unavailable") });
    const logger = { warn: vi.fn() };
    const health = messagingHealth();
    const clientFactory = vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);

    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory,
      logger,
      health
    });

    expect(adapter).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "connection" });
    expect(pubClient.quit).not.toHaveBeenCalled();
    expect(subClient.quit).not.toHaveBeenCalled();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
    expect(health.snapshot()).toEqual({
      realtime: {
        status: "degraded",
        mode: "local-fallback",
        reason: "connection",
        changedAt: "2026-08-11T00:00:00.000Z"
      },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("marks realtime local-fallback when adapter connection times out", async () => {
    vi.useFakeTimers();
    try {
      const pubClient = valkeyClient({ pendingConnect: true });
      const subClient = valkeyClient({ pendingConnect: true });
      const clientFactory = vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);
      const logger = { warn: vi.fn() };
      const health = messagingHealth();

      const adapterPromise = createRoommateSocketAdapter(appContext(), {
        valkeyUrl: "redis://unreachable.internal:6379",
        clientFactory,
        connectTimeoutMs: 5,
        logger,
        health
      });
      await vi.advanceTimersByTimeAsync(5);

      await expect(adapterPromise).resolves.toBeUndefined();
      expect(pubClient.destroy).toHaveBeenCalledTimes(1);
      expect(subClient.destroy).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "timeout" });
      expect(health.snapshot()).toEqual({
        realtime: {
          status: "degraded",
          mode: "local-fallback",
          reason: "timeout",
          changedAt: "2026-08-11T00:00:00.000Z"
        },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks realtime local-fallback on a runtime pub/sub client error", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      logger,
      health
    });

    pubClient.emitError(new Error("unexpected adapter fault"));

    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "runtime" });
    expect(health.snapshot()).toEqual({
      realtime: {
        status: "degraded",
        mode: "local-fallback",
        reason: "runtime",
        changedAt: "2026-08-11T00:00:00.000Z"
      },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("does not include the raw client error or Valkey URL in warnings", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const logger = { warn: vi.fn() };
    const valkeyUrl = "redis://user:pass@valkey.internal:6379";
    const leaked = "victim@example.com token=secret body={private}";
    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl,
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      logger,
      health: messagingHealth()
    });

    pubClient.emitError(new Error(`${leaked} ${valkeyUrl}`));

    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "runtime" });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("victim@example.com");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("secret");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("private");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("redis://");
  });

  it("destroys reconnecting pub/sub clients without waiting for a queued QUIT", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient)
    });
    pubClient.isReady = false;
    subClient.isReady = false;
    pubClient.quit.mockImplementation(() => new Promise(() => undefined));
    subClient.quit.mockImplementation(() => new Promise(() => undefined));

    const result = await Promise.race([
      adapter?.dispose().then(() => "closed" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50))
    ]);

    expect(result).toBe("closed");
    expect(pubClient.quit).not.toHaveBeenCalled();
    expect(subClient.quit).not.toHaveBeenCalled();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys ready pub/sub clients before QUIT can enter a hung closed state", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient)
    });
    pubClient.quit.mockImplementation(function () {
      pubClient.isOpen = false;
      return new Promise(() => undefined);
    });
    subClient.quit.mockImplementation(function () {
      subClient.isOpen = false;
      return new Promise(() => undefined);
    });

    const result = await Promise.race([
      adapter?.dispose().then(() => "closed" as const),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50))
    ]);

    expect(result).toBe("closed");
    expect(pubClient.quit).not.toHaveBeenCalled();
    expect(subClient.quit).not.toHaveBeenCalled();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });

  it("disables the default client's offline queue and handles ignored publish rejections", async () => {
    const publication = { catch: vi.fn() };
    const pubClient = { ...valkeyClient(), publish: vi.fn().mockReturnValue(publication) };
    const subClient = valkeyClient();
    redis.createClient.mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);

    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379"
    });
    pubClient.publish("roommate-channel", "payload");

    expect(redis.createClient).toHaveBeenNthCalledWith(1, {
      url: "redis://valkey.internal:6379",
      disableOfflineQueue: true
    });
    expect(redis.createClient).toHaveBeenNthCalledWith(2, {
      url: "redis://valkey.internal:6379",
      disableOfflineQueue: true
    });
    expect(publication.catch).toHaveBeenCalledWith(expect.any(Function));
  });
});

function appContext() {
  return { getHttpServer: () => ({}) } as never;
}

function messagingHealth() {
  return new MessagingInfrastructureHealth(() => new Date("2026-08-11T00:00:00.000Z"));
}

function valkeyClient(options: { connectError?: Error; pendingConnect?: boolean } = {}) {
  let errorListener: ((error: unknown) => void) | undefined;
  return {
    isOpen: false,
    isReady: false,
    connect: vi.fn().mockImplementation(function (this: { isOpen: boolean; isReady: boolean }) {
      if (options.connectError) return Promise.reject(options.connectError);
      if (options.pendingConnect) return new Promise(() => undefined);
      this.isOpen = true;
      this.isReady = true;
      return Promise.resolve();
    }),
    quit: vi.fn().mockImplementation(function (this: { isOpen: boolean; isReady: boolean }) {
      this.isOpen = false;
      this.isReady = false;
      return Promise.resolve();
    }),
    destroy: vi.fn(),
    on: vi.fn((_event: "error", listener: (error: unknown) => void) => {
      errorListener = listener;
    }),
    emitError(error: unknown) {
      errorListener?.(error);
    }
  };
}
