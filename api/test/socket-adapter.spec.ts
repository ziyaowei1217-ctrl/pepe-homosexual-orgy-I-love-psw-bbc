import { afterEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => redis);

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { createRoommateSocketAdapter } from "../src/roommate-conversations/socket-adapter";

const subscriptions = new Map<string, Set<(message: string) => void>>();
afterEach(() => subscriptions.clear());

describe("optional roommate Socket.IO Valkey adapter", () => {
  it("rejects a production startup outage so the runtime can restart instead of remaining permanently local", async () => {
    const pubClient = valkeyClient({ connectError: new Error("credential-bearing connection failure") });
    const subClient = valkeyClient();
    await expect(createRoommateSocketAdapter(appContext(), {
      nodeEnv: "production", valkeyUrl: "rediss://cache.example.com",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health: messagingHealth(), logger: { warn: vi.fn() }
    })).rejects.toThrow("Production realtime messaging infrastructure is unavailable");
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });

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

  it("contains malformed credential-bearing client construction and closes a partially constructed client", async () => {
    const credential = "realtime-construction-secret";
    const valkeyUrl = `redis://user:${credential}@[`;
    const pubClient = valkeyClient();
    const constructionFailure = Object.assign(new TypeError("Invalid URL"), { input: valkeyUrl });
    const clientFactory = vi.fn().mockReturnValueOnce(pubClient).mockImplementationOnce(() => {
      throw constructionFailure;
    });
    const logger = { warn: vi.fn() };
    const health = messagingHealth();

    await expect(
      createRoommateSocketAdapter(appContext(), { valkeyUrl, clientFactory, logger, health })
    ).resolves.toBeUndefined();

    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "protocol" });
    expect(health.snapshot().realtime).toMatchObject({
      status: "degraded",
      mode: "local-fallback",
      reason: "protocol"
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(credential);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("redis://");
  });

  it("keeps a connection rejection as the only fallback when a client errors during bootstrap", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    subClient.connect.mockImplementation(() => {
      subClient.emitError(new Error("transient client error"));
      return Promise.reject(new Error("socket connection unavailable"));
    });

    await expect(
      createRoommateSocketAdapter(appContext(), {
        valkeyUrl: "redis://valkey.internal:6379",
        clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
        health,
        logger
      })
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "connection" });
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

  it("keeps a timeout as the only fallback when a client errors during bootstrap", async () => {
    vi.useFakeTimers();
    try {
      const pubClient = valkeyClient({ pendingConnect: true });
      const subClient = valkeyClient({ pendingConnect: true });
      const health = messagingHealth();
      const logger = { warn: vi.fn() };
      const adapterPromise = createRoommateSocketAdapter(appContext(), {
        valkeyUrl: "redis://valkey.internal:6379",
        clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
        connectTimeoutMs: 5,
        health,
        logger
      });

      pubClient.emitError(new Error("transient client error"));
      await vi.advanceTimersByTimeAsync(5);
      await expect(adapterPromise).resolves.toBeUndefined();

      expect(logger.warn).toHaveBeenCalledTimes(1);
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

  it("ignores client errors after failed adapter cleanup", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient({ connectError: new Error("socket connection unavailable") });
    const health = messagingHealth();
    const logger = { warn: vi.fn() };

    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health,
      logger
    });
    pubClient.emitError(new Error("late pub error"));
    subClient.emitError(new Error("late sub error"));

    expect(logger.warn).toHaveBeenCalledTimes(1);
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

  it("ignores client errors after adapter disposal", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health,
      logger
    });

    await adapter?.dispose();
    pubClient.emitError(new Error("late pub error"));
    subClient.emitError(new Error("late sub error"));

    expect(logger.warn).not.toHaveBeenCalled();
    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "distributed" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("keeps a failed adapter unready after reconnect signals until process restart", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient), health, logger
    });
    pubClient.isReady = false;
    subClient.isReady = false;
    pubClient.emitError(new Error("connection lost"));
    expect(health.snapshot().realtime.status).toBe("degraded");
    pubClient.isReady = true;
    pubClient.emitReady();
    expect(health.snapshot().realtime.status).toBe("degraded");
    subClient.isReady = true;
    subClient.emitReady();
    await health.refresh();
    expect(health.snapshot().realtime.status).toBe("degraded");
    pubClient.emitError(new Error("later outage"));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    await adapter?.dispose();
    subClient.emitReady();
    expect(health.snapshot().realtime.status).toBe("degraded");
  });

  it("reports only the first runtime pub/sub error after activation", async () => {
    let timestamp = "2026-08-11T00:00:00.000Z";
    const health = new MessagingInfrastructureHealth(() => new Date(timestamp));
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const logger = { warn: vi.fn() };
    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health,
      logger
    });

    pubClient.emitError(new Error("first runtime error"));
    timestamp = "2026-08-11T00:00:01.000Z";
    subClient.emitError(new Error("second runtime error"));
    pubClient.emitError(new Error("third runtime error"));

    expect(logger.warn).toHaveBeenCalledTimes(1);
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

  it("reports and contains a rejected publish without a client error event", async () => {
    const leaked = "publish-rejection-secret redis://user:pass@valkey.internal:6379";
    const pubClient = valkeyClient();
    const transportPublish = pubClient.publish;
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health,
      logger
    });

    transportPublish.mockRejectedValue(new Error(leaked));
    await expect(pubClient.publish("roommate-channel", "payload")).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "runtime" });
    expect(health.snapshot().realtime).toMatchObject({
      status: "degraded",
      mode: "local-fallback",
      reason: "runtime"
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("publish-rejection-secret");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("redis://");
  });

  it("reports and contains a synchronous publish throw without a client error event", async () => {
    const pubClient = valkeyClient();
    const transportPublish = pubClient.publish;
    const subClient = valkeyClient();
    const health = messagingHealth();
    const logger = { warn: vi.fn() };
    await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      health,
      logger
    });

    transportPublish.mockImplementation(() => { throw new Error("synchronous publish secret redis://user:pass@valkey.internal:6379"); });
    let publication: unknown;
    expect(() => {
      publication = pubClient.publish("roommate-channel", "payload");
    }).not.toThrow();
    await expect(Promise.resolve(publication)).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith({ component: "realtime", mode: "local-fallback", reason: "runtime" });
    expect(health.snapshot().realtime).toMatchObject({
      status: "degraded",
      mode: "local-fallback",
      reason: "runtime"
    });
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("synchronous publish secret");
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain("redis://");
  });

  it("requires an active matching pub/sub receipt even while both sockets are ready", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const transportPublish = pubClient.publish;
    const health = messagingHealth();
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://fixture", clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      operationTimeoutMs: 5, health, logger: { warn: vi.fn() }
    });
    transportPublish.mockImplementation(async () => 1); // Command succeeds; subscribed delivery disappears.
    await health.refresh();
    expect(health.snapshot().realtime.status).toBe("degraded");
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
    transportPublish.mockImplementation(async (channel, message) => {
      for (const callback of subscriptions.get(channel) ?? []) callback(message);
      return 1;
    });
    await health.refresh();
    expect(health.snapshot().realtime.status).toBe("degraded");
    await adapter?.dispose();
    const restarted = messagingHealth();
    const freshClients = [valkeyClient(), valkeyClient()];
    const freshAdapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://fixture", clientFactory: () => freshClients.shift()!, operationTimeoutMs: 5, health: restarted
    });
    await restarted.refresh();
    expect(restarted.snapshot().realtime).toEqual({ status: "ok", mode: "distributed" });
    await freshAdapter?.dispose();
  });

  it("bounds hanging publications and retires both clients before another write can queue", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient();
    const transportPublish = pubClient.publish;
    const health = messagingHealth();
    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://fixture", clientFactory: vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient),
      operationTimeoutMs: 5, health, logger: { warn: vi.fn() }
    });
    transportPublish.mockImplementation(() => new Promise(() => undefined));
    await expect(pubClient.publish("events", "message")).resolves.toBeUndefined();
    expect(health.snapshot().realtime).toMatchObject({ status: "degraded", reason: "timeout" });
    const calls = transportPublish.mock.calls.length;
    await pubClient.publish("events", "another message");
    expect(transportPublish.mock.calls).toHaveLength(calls);
    await adapter?.dispose();
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

  it("disables the default pub/sub clients' offline queues", async () => {
    const pubClient = valkeyClient();
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
  });
});

function appContext() {
  return { getHttpServer: () => ({}) } as never;
}

function messagingHealth() {
  return new MessagingInfrastructureHealth(() => new Date("2026-08-11T00:00:00.000Z"));
}

function valkeyClient(options: { connectError?: Error; pendingConnect?: boolean } = {}) {
  const listeners = new Map<string, (error: unknown) => void>();
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
    publish: vi.fn(async (channel: string, message: string) => {
      for (const callback of subscriptions.get(channel) ?? []) callback(message);
      return 1;
    }),
    subscribe: vi.fn(async (channel: string, callback: (message: string) => void) => {
      const channelSubscriptions = subscriptions.get(channel) ?? new Set();
      channelSubscriptions.add(callback);
      subscriptions.set(channel, channelSubscriptions);
    }),
    destroy: vi.fn(),
    on: vi.fn((event: "error" | "ready", listener: (error: unknown) => void) => {
      listeners.set(event, listener);
    }),
    emitError(error: unknown) {
      listeners.get("error")?.(error);
    },
    emitReady() {
      listeners.get("ready")?.(undefined);
    }
  };
}
