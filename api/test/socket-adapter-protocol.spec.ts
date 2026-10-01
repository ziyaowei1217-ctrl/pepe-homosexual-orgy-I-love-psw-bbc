import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "redis";
import { HealthService } from "../src/health/health.service";
import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { createRoommateSocketAdapter } from "../src/roommate-conversations/socket-adapter";
import { pubSubFixture } from "./helpers/protocol-fixtures";

afterEach(() => vi.unstubAllEnvs());

describe("active realtime readiness with the installed Redis TCP client", () => {
  it("detects missing subscribed delivery with successful commands and recovers only in a fresh adapter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const fixture = await pubSubFixture();
    const health = new MessagingInfrastructureHealth();
    const create = () => createClient({ url: fixture.url, disableOfflineQueue: true }) as never;
    const options = { nodeEnv: "production", valkeyUrl: fixture.url, clientFactory: create, operationTimeoutMs: 150, connectTimeoutMs: 500, logger: { warn() {} } };
    let adapter = await createRoommateSocketAdapter({ getHttpServer: () => ({}) } as never, { ...options, health });
    try {
      await health.refresh(); expect(health.snapshot().realtime.status).toBe("ok");
      health.markDistributed("messageRateLimit");
      const auth = new AuthInfrastructureHealth(); auth.registerProbe(async () => undefined);
      const readiness = new HealthService({ $queryRaw: async () => [] } as never, health, auth);
      await expect(readiness.ready()).resolves.toMatchObject({ status: "ok" });
      fixture.state.suppressDelivery = true;
      await health.refresh(); expect(health.snapshot().realtime.status).toBe("degraded");
      await expect(readiness.ready()).rejects.toMatchObject({ status: 503 });
      fixture.state.suppressDelivery = false;
      await health.refresh(); expect(health.snapshot().realtime.status).toBe("degraded");
      await adapter?.dispose();
      const restarted = new MessagingInfrastructureHealth();
      adapter = await createRoommateSocketAdapter({ getHttpServer: () => ({}) } as never, { ...options, health: restarted });
      await restarted.refresh(); expect(restarted.snapshot().realtime).toEqual({ status: "ok", mode: "distributed" });
    } finally { await adapter?.dispose(); await fixture.close(); }
  });

  it("bounds an accepted blackholed publication and closes the actual Redis clients", async () => {
    const fixture = await pubSubFixture();
    const clients: ReturnType<typeof createClient>[] = [];
    const health = new MessagingInfrastructureHealth();
    const adapter = await createRoommateSocketAdapter({ getHttpServer: () => ({}) } as never, {
      nodeEnv: "production", valkeyUrl: fixture.url, health, operationTimeoutMs: 150, connectTimeoutMs: 500,
      clientFactory: () => { const client = createClient({ url: fixture.url, disableOfflineQueue: true }); clients.push(client); return client as never; },
      logger: { warn() {} }
    });
    try {
      fixture.state.suppressPublishReply = true;
      const start = Date.now(); await clients[0].publish("application-room", "message");
      expect(Date.now() - start).toBeLessThan(1_000);
      expect(clients.every(client => !client.isOpen)).toBe(true);
      expect(health.snapshot().realtime.status).toBe("degraded");
      const count = fixture.state.publishes;
      await clients[0].publish("application-room", "second");
      expect(fixture.state.publishes).toBe(count);
    } finally { await adapter?.dispose(); await fixture.close(); }
  });

});
