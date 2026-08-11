import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { HealthController } from "../src/health/health.controller";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { HealthService } from "../src/health/health.service";

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
