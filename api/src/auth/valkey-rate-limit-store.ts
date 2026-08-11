import { randomUUID } from "node:crypto";
import { createClient } from "redis";

import { constructValkeyClient } from "../valkey/valkey-client-construction";
import { InMemoryRateLimitStore, RateLimitRule, RateLimitStore } from "./auth-rate-limit";

type ValkeyCommandClient = {
  isOpen: boolean;
  isReady?: boolean;
  connect(): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  quit?(): Promise<unknown>;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

type RateLimitStoreFactoryInput = {
  nodeEnv?: string;
  valkeyUrl?: string;
  clientFactory?: (url: string) => ValkeyCommandClient;
};

const consumeScript = `
local server_time = redis.call('TIME')
local now_ms = tonumber(server_time[1]) * 1000 + math.floor(tonumber(server_time[2]) / 1000)
local retry_after_ms = 0
for index, key in ipairs(KEYS) do
  local argument_index = (index - 1) * 2
  local limit = tonumber(ARGV[argument_index + 1])
  local window_ms = tonumber(ARGV[argument_index + 2])
  redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms - window_ms)
  local count = tonumber(redis.call('ZCARD', key))
  if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local wait_ms = tonumber(oldest[2]) + window_ms - now_ms
    if wait_ms > retry_after_ms then retry_after_ms = wait_ms end
  end
end
if retry_after_ms > 0 then return {0, math.max(1, math.ceil(retry_after_ms / 1000))} end
local nonce = ARGV[#ARGV]
for index, key in ipairs(KEYS) do
  local argument_index = (index - 1) * 2
  local window_ms = tonumber(ARGV[argument_index + 2])
  redis.call('ZADD', key, now_ms, nonce .. ':' .. tostring(index))
  redis.call('PEXPIRE', key, window_ms)
end
return {1, 0}
`;

export class ValkeyRateLimitStore implements RateLimitStore {
  private connectPromise?: Promise<unknown>;

  constructor(private readonly client: ValkeyCommandClient) {}

  async consume(rules: RateLimitRule[]) {
    if (!this.client.isOpen) {
      const connection = (this.connectPromise ??= this.client.connect());
      try {
        await connection;
      } finally {
        if (this.connectPromise === connection) this.connectPromise = undefined;
      }
    }
    if (!this.client.isOpen || this.client.isReady === false) {
      throw new Error("Valkey command client is not ready");
    }
    const keys = rules.map((rule) => rule.key);
    const args = [
      ...rules.flatMap((rule) => [String(rule.limit), String(rule.windowSeconds * 1000)]),
      randomUUID()
    ];
    const result = await this.client.eval(consumeScript, { keys, arguments: args });
    if (!Array.isArray(result) || result.length < 2) throw new Error("Invalid Valkey rate limit response");
    return {
      allowed: Number(result[0]) === 1,
      retryAfterSeconds: Math.max(0, Number(result[1]))
    };
  }

  async onModuleDestroy() {
    if (this.client.isOpen && this.client.quit) await this.client.quit();
  }
}

export function createRateLimitStore(input: RateLimitStoreFactoryInput = {}): RateLimitStore {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production") return new InMemoryRateLimitStore();

  const valkeyUrl = input.valkeyUrl ?? process.env.VALKEY_URL;
  if (!valkeyUrl) return new InMemoryRateLimitStore();
  const clientCreation = constructValkeyClient(
    valkeyUrl,
    input.clientFactory ?? ((url) => createClient({ url, disableOfflineQueue: true }) as ValkeyCommandClient)
  );
  if (!clientCreation.ok) return new InMemoryRateLimitStore();
  const client = clientCreation.client;
  client.on?.("error", () => undefined);
  return new ValkeyRateLimitStore(client);
}
