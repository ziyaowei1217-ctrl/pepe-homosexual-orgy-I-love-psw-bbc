import { describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("redis", () => redis);

import { createRoommateSocketAdapter } from "../src/roommate-conversations/socket-adapter";

describe("optional roommate Socket.IO Valkey adapter", () => {
  it("does not create Valkey clients when VALKEY_URL is absent", async () => {
    const clientFactory = vi.fn();

    const adapter = await createRoommateSocketAdapter(appContext(), { valkeyUrl: "", clientFactory });

    expect(adapter).toBeUndefined();
    expect(clientFactory).not.toHaveBeenCalled();
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

  it("logs degraded realtime, closes opened clients, and permits HTTP startup after connection failure", async () => {
    const pubClient = valkeyClient();
    const subClient = valkeyClient({ connectError: new Error("unavailable") });
    const logger = { warn: vi.fn() };
    const clientFactory = vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);

    const adapter = await createRoommateSocketAdapter(appContext(), {
      valkeyUrl: "redis://valkey.internal:6379",
      clientFactory,
      logger
    });

    expect(adapter).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("Valkey Socket.IO adapter unavailable; realtime is degraded");
    expect(pubClient.quit).not.toHaveBeenCalled();
    expect(subClient.quit).not.toHaveBeenCalled();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
  });

  it("bounds bootstrap when node-redis keeps retrying an unreachable Valkey", async () => {
    const pubClient = valkeyClient({ pendingConnect: true });
    const subClient = valkeyClient({ pendingConnect: true });
    const clientFactory = vi.fn().mockReturnValueOnce(pubClient).mockReturnValueOnce(subClient);

    const result = await Promise.race([
      createRoommateSocketAdapter(appContext(), {
        valkeyUrl: "redis://unreachable.internal:6379",
        clientFactory,
        connectTimeoutMs: 5,
        logger: { warn: vi.fn() }
      } as never),
      new Promise<"hung">((resolve) => setTimeout(() => resolve("hung"), 50))
    ]);

    expect(result).toBeUndefined();
    expect(pubClient.destroy).toHaveBeenCalledTimes(1);
    expect(subClient.destroy).toHaveBeenCalledTimes(1);
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

function valkeyClient(options: { connectError?: Error; pendingConnect?: boolean } = {}) {
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
    on: vi.fn()
  };
}
