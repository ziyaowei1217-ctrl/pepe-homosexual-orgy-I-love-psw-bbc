import { randomUUID } from "node:crypto";
import { createClient } from "redis";

import { assertProductionValkeyUrl } from "../config/env";
import { AuthInfrastructureHealth } from "../health/auth-infrastructure-health";
import { constructValkeyClient } from "../valkey/valkey-client-construction";
import { InMemoryRateLimitStore, RateLimitRule, RateLimitStore } from "./auth-rate-limit";

type ValkeyCommandClient = {
  isOpen: boolean;
  isReady?: boolean;
  connect(): Promise<unknown>;
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
  ping?(): Promise<unknown>;
  quit?(): Promise<unknown>;
  destroy?(): void;
  on?(event: "error", listener: (error: unknown) => void): unknown;
};

type RateLimitStoreFactoryInput = {
  nodeEnv?: string;
  valkeyUrl?: string;
  clientFactory?: (url: string) => ValkeyCommandClient;
  operationTimeoutMs?: number;
  health?: AuthInfrastructureHealth;
};

type ValkeyRateLimitStoreOptions = {
  clientFactory?: () => ValkeyCommandClient;
  operationTimeoutMs?: number;
};

export class AuthValkeyTimeoutError extends Error {
  constructor() {
    super("Authentication rate limit infrastructure timed out");
    this.name = "AuthValkeyTimeoutError";
  }
}

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
  private client?: ValkeyCommandClient;
  private connectOperation?: { client: ValkeyCommandClient; operation: Promise<unknown> };
  private closed = false;
  private readonly destroyedClients = new WeakSet<ValkeyCommandClient>();
  private readonly operationTimeoutMs: number;

  constructor(client: ValkeyCommandClient, private readonly options: ValkeyRateLimitStoreOptions = {}) {
    this.client = client;
    this.operationTimeoutMs = options.operationTimeoutMs ?? 1_000;
  }

  async consume(rules: RateLimitRule[]) {
    const deadline = Date.now() + this.operationTimeoutMs;
    const client = await this.readyClient(deadline);
    try {
      const result = await this.within(Promise.resolve().then(() => client.eval(consumeScript, {
        keys: rules.map(rule => rule.key),
        arguments: [
          ...rules.flatMap(rule => [String(rule.limit), String(rule.windowSeconds * 1000)]),
          randomUUID()
        ]
      })), deadline, () => this.invalidateClient(client));
      if (!Array.isArray(result) || result.length !== 2 ||
          (result[0] !== 0 && result[0] !== 1) || !Number.isSafeInteger(result[1]) ||
          (result[0] === 1 && result[1] !== 0) || (result[0] === 0 && result[1] < 1)) {
        throw new Error("Invalid Valkey rate limit response");
      }
      return { allowed: result[0] === 1, retryAfterSeconds: result[1] as number };
    } catch (error) {
      this.invalidateClient(client);
      throw error;
    }
  }

  async checkReadiness() {
    const deadline = Date.now() + this.operationTimeoutMs;
    const client = await this.readyClient(deadline);
    try {
      if (!client.ping || await this.within(Promise.resolve().then(() => client.ping!()), deadline,
        () => this.invalidateClient(client)) !== "PONG") throw new Error("Valkey health probe failed");
    } catch (error) {
      this.invalidateClient(client);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.closed = true;
    const client = this.client;
    this.client = undefined;
    if (client) await this.closeClient(client);
  }

  private async readyClient(deadline: number) {
    if (this.closed) throw new Error("Valkey command client is closed");
    const client = this.client ?? this.options.clientFactory?.();
    if (!client) throw new Error("Valkey command client is unavailable");
    this.client = client;
    try {
      if (!client.isOpen || this.connectOperation?.client === client) {
        if (this.connectOperation?.client !== client) {
          const operation = Promise.resolve().then(() => client.connect());
          const tracked = { client, operation };
          this.connectOperation = tracked;
          void operation.then(
            () => { if (this.connectOperation === tracked) this.connectOperation = undefined; },
            () => { if (this.connectOperation === tracked) this.connectOperation = undefined; }
          );
        }
        await this.within(this.connectOperation!.operation, deadline, () => this.invalidateClient(client));
      }
      if (this.client !== client || !client.isOpen || client.isReady === false) {
        throw new Error("Valkey command client is not ready");
      }
      return client;
    } catch (error) {
      this.invalidateClient(client);
      throw error;
    }
  }

  private invalidateClient(client: ValkeyCommandClient) {
    if (this.client === client) this.client = undefined;
    void this.closeClient(client);
  }

  private async closeClient(client: ValkeyCommandClient) {
    if (this.destroyedClients.has(client)) return;
    this.destroyedClients.add(client);
    try {
      if (client.destroy) client.destroy();
      else if (client.isOpen && client.quit) {
        await this.within(Promise.resolve().then(() => client.quit!()), Date.now() + this.operationTimeoutMs);
      }
    } catch {
      // A failed or timed-out shutdown cannot retain this client for later authentication requests.
    }
  }

  private async within<T>(operation: Promise<T>, deadline: number, onTimeout?: () => void): Promise<T> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      void operation.catch(() => undefined);
      onTimeout?.();
      throw new AuthValkeyTimeoutError();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            onTimeout?.();
            reject(new AuthValkeyTimeoutError());
          }, remainingMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

export function createRateLimitStore(input: RateLimitStoreFactoryInput = {}): RateLimitStore {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production") return new InMemoryRateLimitStore();

  const valkeyUrl = input.valkeyUrl ?? process.env.VALKEY_URL;
  assertProductionValkeyUrl(valkeyUrl);
  const clientFactory = input.clientFactory ?? ((url: string) => createClient({ url, disableOfflineQueue: true }) as ValkeyCommandClient);
  const create = () => {
    const creation = constructValkeyClient(valkeyUrl!, clientFactory);
    if (!creation.ok) throw new Error("Production Valkey client configuration is invalid");
    creation.client.on?.("error", () => undefined);
    return creation.client;
  };
  const store = new ValkeyRateLimitStore(create(), { clientFactory: create, operationTimeoutMs: input.operationTimeoutMs });
  input.health?.registerProbe(() => store.checkReadiness());
  return store;
}
