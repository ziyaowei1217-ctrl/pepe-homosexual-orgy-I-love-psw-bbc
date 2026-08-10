import { Logger, type INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Server, ServerOptions } from "socket.io";

type ValkeyPubSubClient = {
  isOpen: boolean;
  isReady?: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy?(): void;
  publish?(...arguments_: unknown[]): { catch(onRejected: (error: unknown) => unknown): unknown };
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

type SocketAdapterOptions = {
  valkeyUrl?: string;
  clientFactory?: (url: string) => ValkeyPubSubClient;
  connectTimeoutMs?: number;
  logger?: { warn(message: string): unknown };
};

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

export class RoommateSocketIoAdapter extends IoAdapter {
  private readonly redisAdapter: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly pubClient: ValkeyPubSubClient,
    private readonly subClient: ValkeyPubSubClient
  ) {
    super(app);
    this.redisAdapter = createAdapter(pubClient as never, subClient as never);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.redisAdapter);
    return server;
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([closeClient(this.pubClient), closeClient(this.subClient)]);
  }
}

export async function createRoommateSocketAdapter(
  app: INestApplicationContext,
  options: SocketAdapterOptions = {}
): Promise<RoommateSocketIoAdapter | undefined> {
  const valkeyUrl = options.valkeyUrl ?? process.env.VALKEY_URL;
  if (!valkeyUrl) return undefined;

  const clientFactory =
    options.clientFactory ??
    ((url: string) => createClient({ url, disableOfflineQueue: true }) as unknown as ValkeyPubSubClient);
  const pubClient = clientFactory(valkeyUrl);
  const subClient = clientFactory(valkeyUrl);
  handleIgnoredPublishRejections(pubClient);
  pubClient.on?.("error", () => undefined);
  subClient.on?.("error", () => undefined);

  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const connections = await Promise.allSettled([
    connectWithin(pubClient, connectTimeoutMs),
    connectWithin(subClient, connectTimeoutMs)
  ]);
  if (connections.some((connection) => connection.status === "rejected")) {
    await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    (options.logger ?? new Logger("RoommateSocketAdapter")).warn(
      "Valkey Socket.IO adapter unavailable; realtime is degraded"
    );
    return undefined;
  }

  return new RoommateSocketIoAdapter(app, pubClient, subClient);
}

async function closeClient(client: ValkeyPubSubClient): Promise<void> {
  if (client.destroy) {
    client.destroy();
    return;
  }
  if (client.isOpen) await client.quit();
}

async function connectWithin(client: ValkeyPubSubClient, timeoutMs: number): Promise<void> {
  await settleWithin(client.connect(), timeoutMs);
}

async function settleWithin<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Valkey operation timed out")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function handleIgnoredPublishRejections(client: ValkeyPubSubClient): void {
  if (!client.publish) return;
  const publish = client.publish.bind(client);
  client.publish = (...arguments_: unknown[]) => {
    const result = publish(...arguments_);
    void result.catch(() => undefined);
    return result;
  };
}
