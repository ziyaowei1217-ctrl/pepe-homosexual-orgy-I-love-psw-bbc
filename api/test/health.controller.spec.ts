import { ServiceUnavailableException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { HealthController } from "../src/health/health.controller";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { HealthService } from "../src/health/health.service";

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("HealthService", () => {
  it("returns process liveness without checking dependencies", () => {
    const service = new HealthService(
      { $queryRaw: async () => [{ ok: 1 }] } as never,
      new MessagingInfrastructureHealth()
    );

    expect(service.health()).toEqual({ status: "ok" });
  });

  it("returns readiness when the database query succeeds", async () => {
    const service = new HealthService(
      { $queryRaw: async () => [{ ok: 1 }] } as never,
      new MessagingInfrastructureHealth()
    );

    await expect(service.ready()).resolves.toEqual({
      status: "ok",
      checks: {
        database: "ok",
        realtime: { status: "ok", mode: "single-instance" },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      }
    });
  });

  it("returns degraded readiness while the database remains available", async () => {
    const infrastructure = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));
    infrastructure.markLocalFallback("realtime", "connection");
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never, infrastructure);

    await expect(service.ready()).resolves.toEqual({
      status: "degraded",
      checks: {
        database: "ok",
        realtime: {
          status: "degraded",
          mode: "local-fallback",
          reason: "connection",
          changedAt: "2026-08-10T00:00:00.000Z"
        },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      }
    });
  });

  it("keeps required production dependencies out of rotation and becomes ready after recovery", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const infrastructure = new MessagingInfrastructureHealth();
    infrastructure.markDistributed("realtime");
    infrastructure.markDistributed("messageRateLimit");
    const auth = new AuthInfrastructureHealth();
    let authAvailable = false;
    auth.registerProbe(async () => { if (!authAvailable) throw new Error("rediss://secret:credential@cache"); });
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never, infrastructure, auth);
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await service.ready().catch(error => {
      expect(JSON.stringify(error.getResponse())).not.toContain("credential");
      expect(error.getResponse().checks).toMatchObject({ database: "ok", authRateLimit: { status: "error" } });
    });
    authAvailable = true;
    await expect(service.ready()).resolves.toMatchObject({ status: "ok", checks: { authRateLimit: { status: "ok", mode: "distributed" } } });
    infrastructure.markLocalFallback("realtime", "connection");
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    infrastructure.markDistributed("realtime");
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
  });

  it("rejects unconfigured or local-only dependencies in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const infrastructure = new MessagingInfrastructureHealth();
    const auth = new AuthInfrastructureHealth();
    auth.registerProbe(async () => undefined);
    const service = new HealthService({ $queryRaw: async () => [] } as never, infrastructure, auth);
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    infrastructure.markDistributed("realtime");
    infrastructure.markDistributed("messageRateLimit");
    await expect(new HealthService({ $queryRaw: async () => [] } as never, infrastructure).ready()).rejects.toMatchObject({ status: 503 });
  });

  it("responds at 3.5 seconds without accumulating readiness queries, then recovers", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const query = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const service = new HealthService({ $queryRaw: query } as never, new MessagingInfrastructureHealth());
    const first = service.ready().catch(error => error.getStatus());
    const second = service.ready().catch(error => error.getStatus());
    await vi.advanceTimersByTimeAsync(3_499);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(503); expect(await second).toBe(503);
    const next = service.ready();
    expect(query).toHaveBeenCalledTimes(1);
    release(); await expect(next).resolves.toMatchObject({ status: "ok" });
    query.mockResolvedValueOnce(undefined);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("returns service unavailable when the database query fails", async () => {
    const infrastructure = new MessagingInfrastructureHealth();
    const service = new HealthService({
      $queryRaw: async () => {
        throw new Error("database offline");
      }
    } as never, infrastructure);

    await expect(service.ready()).rejects.toThrow(ServiceUnavailableException);
    await service.ready().catch((error: unknown) => {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        status: "error",
        checks: {
          database: "error",
          realtime: { status: "ok", mode: "single-instance" },
          messageRateLimit: { status: "ok", mode: "single-instance" }
        }
      });
    });
  });
});

describe("HealthController", () => {
  it("delegates health and readiness checks", async () => {
    const service = new HealthService(
      { $queryRaw: async () => [{ ok: 1 }] } as never,
      new MessagingInfrastructureHealth()
    );
    const controller = new HealthController(service);

    expect(controller.health()).toEqual({ status: "ok" });
    await expect(controller.ready()).resolves.toEqual({
      status: "ok",
      checks: {
        database: "ok",
        realtime: { status: "ok", mode: "single-instance" },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      }
    });
  });
});
