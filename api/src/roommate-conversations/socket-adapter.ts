import { randomUUID } from "node:crypto";
import { Logger, type INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import type { Server, ServerOptions } from "socket.io";

import { MessagingInfrastructureHealth } from "../health/messaging-infrastructure-health";
import { constructValkeyClient } from "../valkey/valkey-client-construction";
import { categorizeValkeyFailure, ValkeyOperationTimeoutError } from "./roommate-message-rate-limit";

type ValkeyPubSubClient = {
  isOpen: boolean;
  isReady?: boolean;
  connect(): Promise<unknown>;
  quit(): Promise<unknown>;
  destroy?(): void;
  publish?(channel: string, message: string): unknown;
  subscribe?(channel: string, listener: (message: string) => void): Promise<unknown>;
  on?(event: "error" | "ready", listener: (error: unknown) => void): unknown;
};

type SocketAdapterOptions = {
  nodeEnv?: string;
  valkeyUrl?: string;
  clientFactory?: (url: string) => ValkeyPubSubClient;
  connectTimeoutMs?: number;
  operationTimeoutMs?: number;
  health?: MessagingInfrastructureHealth;
  logger?: { warn(message: Record<string, string>): unknown };
};

const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 1_000;

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

  const clientFactory = options.clientFactory ??
    ((url: string) => createClient({ url, disableOfflineQueue: true }) as unknown as ValkeyPubSubClient);
  const logger = options.logger ?? new Logger("RoommateSocketAdapter");
  const reportStartupFallback = (reason: "protocol" | ReturnType<typeof categorizeValkeyFailure>) => {
    options.health?.markLocalFallback("realtime", reason);
    logger.warn({ component: "realtime", mode: "local-fallback", reason });
    if ((options.nodeEnv ?? process.env.NODE_ENV) === "production") {
      throw new Error("Production realtime messaging infrastructure is unavailable");
    }
  };
  const pubCreation = constructValkeyClient(valkeyUrl, clientFactory);
  if (!pubCreation.ok) {
    reportStartupFallback(pubCreation.reason);
    return undefined;
  }
  const pubClient = pubCreation.client;
  const subCreation = constructValkeyClient(valkeyUrl, clientFactory);
  if (!subCreation.ok) {
    await Promise.allSettled([closeClient(pubClient)]);
    reportStartupFallback(subCreation.reason);
    return undefined;
  }
  const subClient = subCreation.client;
  let lifecycle: "connecting" | "active" | "failed" | "closed" = "connecting";
  const operationTimeoutMs = options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS;
  const markRuntimeFailure = (reason: ReturnType<typeof categorizeValkeyFailure> = "runtime") => {
    if (lifecycle !== "active") return;
    lifecycle = "failed";
    options.health?.markLocalFallback("realtime", reason);
    logger.warn({ component: "realtime", mode: "local-fallback", reason });
    // Do not replace the adapter underneath live Socket.IO rooms. A required
    // dependency failure remains unready until the host restarts this process.
    void Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
  };
  pubClient.on?.("error", () => markRuntimeFailure());
  subClient.on?.("error", () => markRuntimeFailure());
  const connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  const connections = await Promise.allSettled([
    settleWithin(pubClient.connect(), connectTimeoutMs),
    settleWithin(subClient.connect(), connectTimeoutMs)
  ]);
  const failedConnection = connections.find(
    (connection): connection is PromiseRejectedResult => connection.status === "rejected"
  );
  if (failedConnection) {
    lifecycle = "closed";
    await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    reportStartupFallback(categorizeValkeyFailure(failedConnection.reason));
    return undefined;
  }

  const probeChannel = `roommate-realtime-health:${randomUUID()}`;
  const rawPublish = pubClient.publish?.bind(pubClient);
  let expectedMessage: { nonce: string; receive: () => void } | undefined;
  let inFlightProbe: Promise<void> | undefined;
  const requireActiveConnections = () => {
    if (lifecycle === "failed" || lifecycle === "closed" || !rawPublish || !pubClient.isReady || !subClient.isReady) {
      throw new Error("Realtime connection is unavailable");
    }
  };
  const roundTrip = async () => {
    requireActiveConnections();
    const nonce = randomUUID();
    const delivered = new Promise<void>(resolve => { expectedMessage = { nonce, receive: resolve }; });
    try {
      // Both publishing a command and receiving that unique nonce through the
      // subscribed connection must succeed. PING/isReady alone is insufficient.
      await settleWithin(Promise.all([Promise.resolve().then(() => rawPublish!(probeChannel, nonce)), delivered]), operationTimeoutMs);
      requireActiveConnections();
      options.health?.markDistributed("realtime");
    } finally {
      if (expectedMessage?.nonce === nonce) expectedMessage = undefined;
    }
  };
  const checkReadiness = () => {
    if (inFlightProbe) return inFlightProbe;
    inFlightProbe = roundTrip().catch(error => {
      markRuntimeFailure(categorizeValkeyFailure(error));
      throw error;
    }).finally(() => { inFlightProbe = undefined; });
    return inFlightProbe;
  };
  try {
    if (!rawPublish || !subClient.subscribe) throw new Error("Pub/Sub commands are unavailable");
    await settleWithin(subClient.subscribe(probeChannel, message => {
      if (expectedMessage?.nonce === message) expectedMessage.receive();
    }), operationTimeoutMs);
    await roundTrip();
  } catch (error) {
    lifecycle = "closed";
    await Promise.allSettled([closeClient(pubClient), closeClient(subClient)]);
    reportStartupFallback(categorizeValkeyFailure(error));
    return undefined;
  }
  lifecycle = "active";
  options.health?.registerProbe("realtime", checkReadiness);
  pubClient.publish = (channel, message) => {
    if (lifecycle !== "active") return Promise.resolve(undefined);
    return settleWithin(Promise.resolve().then(() => rawPublish!(channel, message)), operationTimeoutMs).catch(error => {
      markRuntimeFailure(categorizeValkeyFailure(error));
      return undefined;
    });
  };
  return new RoommateSocketIoAdapter(app, pubClient, subClient, () => { lifecycle = "closed"; });
}

async function closeClient(client: ValkeyPubSubClient): Promise<void> {
  try {
    if (client.destroy) client.destroy();
    else if (client.isOpen) await settleWithin(client.quit(), DEFAULT_OPERATION_TIMEOUT_MS);
  } catch { /* A retired client cannot affect readiness or expose its raw driver error. */ }
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
