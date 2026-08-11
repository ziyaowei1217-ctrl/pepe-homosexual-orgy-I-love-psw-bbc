import { randomUUID } from "node:crypto";
import { HttpException, HttpStatus, Logger } from "@nestjs/common";
import { createClient } from "redis";

import {
  MessagingInfrastructureHealth,
  type MessagingInfrastructureReason
} from "../health/messaging-infrastructure-health";

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

class ValkeyOperationTimeoutError extends Error {}

class ValkeyProtocolError extends Error {}

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

export function categorizeValkeyFailure(error: unknown): MessagingInfrastructureReason {
  if (error instanceof ValkeyOperationTimeoutError) return "timeout";
  if (error instanceof ValkeyProtocolError) return "protocol";
  if (error instanceof Error && /connect|socket|closed|ECONN/i.test(error.name + " " + error.message)) {
    return "connection";
  }
  return "runtime";
}

export class ValkeyRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private connectPromise?: Promise<unknown>;
  private readonly operationTimeoutMs: number;

  constructor(
    private readonly client: RoommateMessageValkeyClient,
    options: ValkeyRoommateMessageRateLimiterOptions = {}
  ) {
    super();
    this.operationTimeoutMs = options.operationTimeoutMs ?? 1_000;
  }

  async consume(request: RoommateMessageRateLimitRequest): Promise<void> {
    if (!this.client.isOpen) {
      const connection = (this.connectPromise ??= settleWithin(
        Promise.resolve().then(() => this.client.connect()),
        this.operationTimeoutMs
      ));
      try {
        await connection;
      } finally {
        if (this.connectPromise === connection) this.connectPromise = undefined;
      }
    }

    const result = await settleWithin(
      Promise.resolve().then(() =>
        this.client.eval(consumeScript, {
          keys: [`roommate-message-rate-limit:${request.userId}:${request.conversationId}`],
          arguments: ["20", "60000", randomUUID()]
        })
      ),
      this.operationTimeoutMs
    );
    if (!Array.isArray(result) || result.length < 2) throw new ValkeyProtocolError();
    if (Number(result[0]) !== 1) throw rateLimitExceeded(Math.max(1, Number(result[1])));
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.destroy) {
      this.client.destroy();
      return;
    }
    if (!this.client.isOpen) return;
    if (this.client.quit) await this.client.quit();
  }
}

export class ResilientRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private nextDistributedProbeAt = 0;
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
    const now = this.now();
    if (now < this.nextDistributedProbeAt) return this.local.consume(request);

    try {
      await this.distributed.consume(request);
      this.health.markDistributed("messageRateLimit");
    } catch (error) {
      if (isRateLimitExceeded(error)) throw error;
      const reason = categorizeValkeyFailure(error);
      this.nextDistributedProbeAt = now + this.retryCooldownMs;
      this.health.markLocalFallback("messageRateLimit", reason);
      this.logger.warn({ component: "messageRateLimit", mode: "local-fallback", reason });
      await this.local.consume(request);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const destroy = (this.distributed as { onModuleDestroy?: () => Promise<void> }).onModuleDestroy;
    if (destroy) await destroy.call(this.distributed);
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

  const client = input.clientFactory?.(valkeyUrl) ?? (createClient({ url: valkeyUrl }) as RoommateMessageValkeyClient);
  client.on?.("error", () => undefined);
  health.markDistributed("messageRateLimit");
  return new ResilientRoommateMessageRateLimiter({
    distributed: new ValkeyRoommateMessageRateLimiter(client, { operationTimeoutMs: input.operationTimeoutMs }),
    local: new LocalRoommateMessageRateLimiter({ now: input.now }),
    health,
    now: input.now,
    retryCooldownMs: input.retryCooldownMs,
    logger: input.logger
  });
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
