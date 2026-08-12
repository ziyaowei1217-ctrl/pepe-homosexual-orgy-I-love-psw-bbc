import { randomUUID } from "node:crypto";
import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { createClient } from "redis";

import {
  MessagingInfrastructureHealth,
  type MessagingInfrastructureReason
} from "../health/messaging-infrastructure-health";
import { constructValkeyClient } from "../valkey/valkey-client-construction";

export type RoommateMessageRateLimitRequest = {
  userId: string;
  conversationId: string;
  now?: Date;
};

export abstract class RoommateMessageRateLimiter {
  abstract consume(request: RoommateMessageRateLimitRequest): Promise<void>;
}

type RoommateMessageValkeyClient = {
  isOpen: boolean;
  isReady?: boolean;
  connect(): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  quit?(): Promise<unknown>;
  destroy?(): void;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

type RoommateMessageRateLimiterFactoryInput = {
  valkeyUrl?: string;
  clientFactory?: (url: string) => RoommateMessageValkeyClient;
  health?: MessagingInfrastructureHealth;
  now?: () => number;
  operationTimeoutMs?: number;
  retryCooldownMs?: number;
  logger?: { warn(message: Record<string, string>): unknown };
};

type LocalRoommateMessageRateLimiterOptions = {
  now?: () => number;
  limit?: number;
  windowMs?: number;
};

type ValkeyRoommateMessageRateLimiterOptions = {
  operationTimeoutMs?: number;
  clientFactory?: () => RoommateMessageValkeyClient | undefined;
};

type ResilientLimiterOptions = {
  distributed: RoommateMessageRateLimiter;
  local: LocalRoommateMessageRateLimiter;
  health: MessagingInfrastructureHealth;
  now?: () => number;
  retryCooldownMs?: number;
  logger?: { warn(message: Record<string, string>): unknown };
};

export class LocalRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private readonly timestamps = new Map<string, number[]>();
  private readonly now: () => number;
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(options: LocalRoommateMessageRateLimiterOptions = {}) {
    super();
    this.now = options.now ?? Date.now;
    this.limit = options.limit ?? 20;
    this.windowMs = options.windowMs ?? 60_000;
  }

  async consume(request: RoommateMessageRateLimitRequest) {
    const now = request.now?.getTime() ?? this.now();
    const key = `${request.userId}:${request.conversationId}`;
    const active = (this.timestamps.get(key) ?? []).filter((timestamp) => timestamp > now - this.windowMs);

    if (active.length >= this.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((active[0] + this.windowMs - now) / 1000));
      this.timestamps.set(key, active);
      throw rateLimitExceeded(retryAfterSeconds);
    }

    active.push(now);
    this.timestamps.set(key, active);
  }
}

const consumeScript = `
local server_time = redis.call('TIME')
local now_ms = tonumber(server_time[1]) * 1000 + math.floor(tonumber(server_time[2]) / 1000)
local limit = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now_ms - window_ms)
local count = tonumber(redis.call('ZCARD', KEYS[1]))
if count >= limit then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  local retry_after_ms = tonumber(oldest[2]) + window_ms - now_ms
  return {0, math.max(1, math.ceil(retry_after_ms / 1000))}
end
redis.call('ZADD', KEYS[1], now_ms, ARGV[3])
redis.call('PEXPIRE', KEYS[1], window_ms)
return {1, 0}
`;

export class ValkeyOperationTimeoutError extends Error {}

class ValkeyProtocolError extends Error {}
class ValkeyCommandNotReadyError extends Error {}

async function settleWithin<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  void operation.catch(() => undefined);
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ValkeyOperationTimeoutError());
          onTimeout?.();
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function categorizeValkeyFailure(error: unknown): MessagingInfrastructureReason {
  if (error instanceof ValkeyOperationTimeoutError) return "timeout";
  if (error instanceof ValkeyProtocolError) return "protocol";
  if (error instanceof ValkeyCommandNotReadyError) return "connection";
  if (error instanceof Error && /connect|socket|closed|ECONN/i.test(error.name + " " + error.message)) {
    return "connection";
  }
  return "runtime";
}

export class ValkeyRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private client?: RoommateMessageValkeyClient;
  private connectOperation?: { client: RoommateMessageValkeyClient; operation: Promise<unknown> };
  private readonly operationTimeoutMs: number;
  private readonly clientFactory?: () => RoommateMessageValkeyClient | undefined;
  private readonly destroyedClients = new WeakSet<RoommateMessageValkeyClient>();
  private closed = false;

  constructor(
    client: RoommateMessageValkeyClient,
    options: ValkeyRoommateMessageRateLimiterOptions = {}
  ) {
    super();
    this.client = client;
    this.operationTimeoutMs = options.operationTimeoutMs ?? 1_000;
    this.clientFactory = options.clientFactory;
  }

  async consume(request: RoommateMessageRateLimitRequest): Promise<void> {
    const client = this.currentClient();
    if (!client.isOpen) {
      const connection =
        this.connectOperation?.client === client ? this.connectOperation.operation : this.startConnect(client);
      await settleWithin(connection, this.operationTimeoutMs, () => this.invalidateClient(client));
    }
    if (this.client !== client || !client.isOpen || client.isReady === false) {
      throw new ValkeyCommandNotReadyError();
    }

    const evaluation = Promise.resolve().then(() =>
      client.eval(consumeScript, {
        keys: [`roommate-message-rate-limit:${request.userId}:${request.conversationId}`],
        arguments: ["20", "60000", randomUUID()]
      })
    );
    const result = await settleWithin(
      evaluation,
      this.operationTimeoutMs,
      () => this.invalidateClient(client)
    );
    if (!Array.isArray(result) || result.length < 2) throw new ValkeyProtocolError();
    const [allowed, retryAfterSeconds] = result;
    if (
      (allowed !== 0 && allowed !== 1) ||
      typeof retryAfterSeconds !== "number" ||
      !Number.isFinite(retryAfterSeconds) ||
      !Number.isInteger(retryAfterSeconds) ||
      (allowed === 1 && retryAfterSeconds !== 0) ||
      (allowed === 0 && retryAfterSeconds < 1)
    ) {
      throw new ValkeyProtocolError();
    }
    if (allowed === 0) throw rateLimitExceeded(retryAfterSeconds);
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    const client = this.client;
    this.client = undefined;
    if (!client) return;
    const isConnecting = this.connectOperation?.client === client;
    if (!client.isOpen && !isConnecting) return;
    if (client.destroy) {
      this.destroyClient(client);
      return;
    }
    if (!client.isOpen) return;
    if (client.quit) await client.quit();
  }

  private currentClient(): RoommateMessageValkeyClient {
    if (this.client) return this.client;
    if (this.closed) throw new ValkeyCommandNotReadyError();
    const replacement = this.clientFactory?.();
    if (!replacement) throw new ValkeyProtocolError();
    this.client = replacement;
    return replacement;
  }

  private startConnect(client: RoommateMessageValkeyClient): Promise<unknown> {
    const operation = Promise.resolve().then(() => client.connect());
    const tracked = { client, operation };
    this.connectOperation = tracked;
    void operation.then(
      () => this.clearConnectOperation(tracked),
      () => this.clearConnectOperation(tracked)
    );
    return operation;
  }

  private clearConnectOperation(tracked: {
    client: RoommateMessageValkeyClient;
    operation: Promise<unknown>;
  }): void {
    if (this.connectOperation === tracked) this.connectOperation = undefined;
  }

  private invalidateClient(client: RoommateMessageValkeyClient): void {
    if (this.client === client) this.client = undefined;
    this.destroyClient(client);
  }

  private destroyClient(client: RoommateMessageValkeyClient): void {
    if (this.destroyedClients.has(client)) return;
    this.destroyedClients.add(client);
    if (client.destroy) {
      try {
        client.destroy();
      } catch {
        // The client remains invalidated even when its driver reports that it was already closed.
      }
      return;
    }
    if (client.isOpen && client.quit) {
      void Promise.resolve()
        .then(() => client.quit?.())
        .catch(() => undefined);
    }
  }
}

type DistributedRecoveryState =
  | { mode: "distributed" }
  | { mode: "cooldown"; nextProbeAt: number }
  | { mode: "probing" };

export class ResilientRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private recoveryState: DistributedRecoveryState = { mode: "distributed" };
  private readonly distributed: RoommateMessageRateLimiter;
  private readonly local: LocalRoommateMessageRateLimiter;
  private readonly health: MessagingInfrastructureHealth;
  private readonly now: () => number;
  private readonly retryCooldownMs: number;
  private readonly logger: { warn(message: Record<string, string>): unknown };

  constructor(options: ResilientLimiterOptions) {
    super();
    this.distributed = options.distributed;
    this.local = options.local;
    this.health = options.health;
    this.now = options.now ?? Date.now;
    this.retryCooldownMs = options.retryCooldownMs ?? 30_000;
    this.logger = options.logger ?? new Logger("RoommateMessageRateLimiter");
  }

  async consume(request: RoommateMessageRateLimitRequest): Promise<void> {
    if (this.recoveryState.mode === "probing") return this.local.consume(request);
    if (this.recoveryState.mode === "cooldown") {
      if (this.now() < this.recoveryState.nextProbeAt) return this.local.consume(request);
      this.recoveryState = { mode: "probing" };
    }

    try {
      await this.distributed.consume(request);
      this.markDistributed();
    } catch (error) {
      if (isRateLimitExceeded(error)) {
        this.markDistributed();
        throw error;
      }
      const reason = categorizeValkeyFailure(error);
      this.recoveryState = { mode: "cooldown", nextProbeAt: this.now() + this.retryCooldownMs };
      this.health.markLocalFallback("messageRateLimit", reason);
      this.logger.warn({ component: "messageRateLimit", mode: "local-fallback", reason });
      await this.local.consume(request);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const destroy = (this.distributed as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy;
    if (destroy) await destroy.call(this.distributed);
  }

  private markDistributed(): void {
    this.recoveryState = { mode: "distributed" };
    this.health.markDistributed("messageRateLimit");
  }
}

export function createRoommateMessageRateLimiter(
  input: RoommateMessageRateLimiterFactoryInput = {}
): RoommateMessageRateLimiter {
  const valkeyUrl = input.valkeyUrl ?? process.env.VALKEY_URL;
  const health = input.health ?? new MessagingInfrastructureHealth();
  if (!valkeyUrl) {
    health.markSingleInstance("messageRateLimit");
    return new LocalRoommateMessageRateLimiter({ now: input.now });
  }

  const logger = input.logger ?? new Logger("RoommateMessageRateLimiter");
  const clientFactory = () => {
    const creation = constructValkeyClient(
      valkeyUrl,
      input.clientFactory ??
        ((url) => createClient({ url, disableOfflineQueue: true }) as RoommateMessageValkeyClient)
    );
    if (!creation.ok) return undefined;
    const client = creation.client;
    try {
      client.on?.("error", () => undefined);
    } catch {
      safelyDestroyConstructedClient(client);
      return undefined;
    }
    return client;
  };
  const client = clientFactory();
  if (!client) {
    health.markLocalFallback("messageRateLimit", "protocol");
    logger.warn({ component: "messageRateLimit", mode: "local-fallback", reason: "protocol" });
    return new LocalRoommateMessageRateLimiter({ now: input.now });
  }
  health.markDistributed("messageRateLimit");
  return new ResilientRoommateMessageRateLimiter({
    distributed: new ValkeyRoommateMessageRateLimiter(client, {
      operationTimeoutMs: input.operationTimeoutMs,
      clientFactory
    }),
    local: new LocalRoommateMessageRateLimiter({ now: input.now }),
    health,
    now: input.now,
    retryCooldownMs: input.retryCooldownMs,
    logger
  });
}

function safelyDestroyConstructedClient(client: RoommateMessageValkeyClient): void {
  try {
    client.destroy?.();
  } catch {
    // No raw construction or cleanup failure crosses the sanitized fallback boundary.
  }
}

function isRateLimitExceeded(error: unknown): error is HttpException {
  return error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS;
}

function rateLimitExceeded(retryAfterSeconds: number) {
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Roommate message rate limit exceeded", retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS
  );
}
