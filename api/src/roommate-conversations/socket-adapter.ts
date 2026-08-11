import { Logger, type INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Server, ServerOptions } from "socket.io";

import { MessagingInfrastructureHealth } from "../health/messaging-infrastructure-health";
import { categorizeValkeyFailure, ValkeyOperationTimeoutError } from "./roommate-message-rate-limit";

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
  health?: MessagingInfrastructureHealth;
  logger?: { warn(message: Record<string, string>): unknown };
};

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;

export class RoommateSocketIoAdapter extends IoAdapter {
  private readonly redisAdapter: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly pubClient: ValkeyPubSubClient,
    private readonly subClient: ValkeyPubSubClient,
    private readonly deactivateRuntimeErrorReporting?: () => void
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
    this.deactivateRuntimeErrorReporting?.();
    await Promise.allSettled([closeClient(this.pubClient), closeClient(this.subClient)]);
  }
}

export async function createRoommateSocketAdapter(
  app: INestApplicationContext,
  options: SocketAdapterOptions = {}
): Promise<RoommateSocketIoAdapter | undefined> {
  const valkeyUrl = options.valkeyUrl ?? process.env.VALKEY_URL;
  if (!valkeyUrl) {
    options.health?.markSingleInstance("realtime");
    return undefined;
  }

  const clientFactory =
    options.clientFactory ??
    ((url: string) => createClient({ url, disableOfflineQueue: true }) as unknown as ValkeyPubSubClient);
  const pubClient = clientFactory(valkeyUrl);
  const subClient = clientFactory(valkeyUrl);
  const logger = options.logger ?? new Logger("RoommateSocketAdapter");
  let lifecycle: "connecting" | "active" | "closed" = "connecting";
  let runtimeFallbackReported = false;
  const markRuntimeFallback = () => {
    if (lifecycle !== "active" || runtimeFallbackReported) return;
    runtimeFallbackReported = true;
    options.health?.markLocalFallback("realtime", "runtime");
    logger.warn({ component: "realtime", mode: "local-fallback", reason: "runtime" });
  };
  handleIgnoredPublishRejections(pubClient);
  pubClient.on?.("error", markRuntimeFallback);
  subClient.on?.("error", markRuntimeFallback);

  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const connections = await Promise.allSettled([
    connectWithin(pubClient, connectTimeoutMs),
    connectWithin(subClient, connectTimeoutMs)
  ]);
  const failedConnection = connections.find(
    (connection): connection is PromiseRejectedResult => connection.status === "rejected"
  );
  if (failedConnection) {
    const reason = categorizeValkeyFailure(failedConnection.reason);
    lifecycle = "closed";
    await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    options.health?.markLocalFallback("realtime", reason);
    logger.warn({ component: "realtime", mode: "local-fallback", reason });
    return undefined;
  }

  options.health?.markDistributed("realtime");
  lifecycle = "active";
  return new RoommateSocketIoAdapter(app, pubClient, subClient, () => {
    lifecycle = "closed";
  });
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
        timer = setTimeout(() => reject(new ValkeyOperationTimeoutError()), timeoutMs);
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
