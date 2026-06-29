import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

describe("HealthService", () => {
  it("returns process liveness without checking dependencies", () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);

    expect(service.health()).toEqual({ status: "ok" });
  });

  it("returns readiness when the database query succeeds", async () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);

    await expect(service.ready()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" }
    });
  });

  it("returns service unavailable when the database query fails", async () => {
    const service = new HealthService({
      $queryRaw: async () => {
        throw new Error("database offline");
      }
    } as never);

    await expect(service.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});

describe("HealthController", () => {
  it("delegates health and readiness checks", async () => {
    const service = new HealthService({ $queryRaw: async () => [{ ok: 1 }] } as never);
    const controller = new HealthController(service);

    expect(controller.health()).toEqual({ status: "ok" });
    await expect(controller.ready()).resolves.toEqual({
      status: "ok",
      checks: { database: "ok" }
    });
  });
});
