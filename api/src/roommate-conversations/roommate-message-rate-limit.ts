import { randomUUID } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import { createClient } from "redis";

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
};

type LocalRoommateMessageRateLimiterOptions = {
  now?: () => number;
  limit?: number;
  windowMs?: number;
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

export class ValkeyRoommateMessageRateLimiter extends RoommateMessageRateLimiter {
  private connectPromise?: Promise<unknown>;

  constructor(private readonly client: RoommateMessageValkeyClient) {
    super();
  }

  async consume(request: RoommateMessageRateLimitRequest): Promise<void> {
    if (!this.client.isOpen) {
      const connection = (this.connectPromise ??= this.client.connect());
      try {
        await connection;
      } finally {
        if (this.connectPromise === connection) this.connectPromise = undefined;
      }
    }

    const result = await this.client.eval(consumeScript, {
      keys: [`roommate-message-rate-limit:${request.userId}:${request.conversationId}`],
      arguments: ["20", "60000", randomUUID()]
    });
    if (!Array.isArray(result) || result.length < 2) throw new Error("Invalid Valkey roommate rate limit response");
    if (Number(result[0]) !== 1) throw rateLimitExceeded(Math.max(1, Number(result[1])));
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client.isOpen) return;
    if (this.client.destroy) {
      this.client.destroy();
      return;
    }
    if (this.client.quit) await this.client.quit();
  }
}

export function createRoommateMessageRateLimiter(
  input: RoommateMessageRateLimiterFactoryInput = {}
): RoommateMessageRateLimiter {
  const valkeyUrl = input.valkeyUrl ?? process.env.VALKEY_URL;
  if (!valkeyUrl) return new LocalRoommateMessageRateLimiter();

  const client = input.clientFactory?.(valkeyUrl) ?? (createClient({ url: valkeyUrl }) as RoommateMessageValkeyClient);
  client.on?.("error", () => undefined);
  return new ValkeyRoommateMessageRateLimiter(client);
}

function rateLimitExceeded(retryAfterSeconds: number) {
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: "Roommate message rate limit exceeded", retryAfterSeconds },
    HttpStatus.TOO_MANY_REQUESTS
  );
}
