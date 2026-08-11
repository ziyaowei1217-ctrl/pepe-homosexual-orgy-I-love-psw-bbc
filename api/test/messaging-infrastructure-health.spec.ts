import { describe, expect, it } from "vitest";

import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";

describe("MessagingInfrastructureHealth", () => {
  it("defaults both components to healthy single-instance operation", () => {
    const health = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));

    expect(health.snapshot()).toEqual({
      realtime: { status: "ok", mode: "single-instance" },
      messageRateLimit: { status: "ok", mode: "single-instance" }
    });
  });

  it("reports only sanitized fallback reasons and clears them on recovery", () => {
    const health = new MessagingInfrastructureHealth(() => new Date("2026-08-10T00:00:00.000Z"));

    health.markLocalFallback("realtime", "connection");
    expect(health.snapshot().realtime).toEqual({
      status: "degraded",
      mode: "local-fallback",
      reason: "connection",
      changedAt: "2026-08-10T00:00:00.000Z"
    });

    health.markDistributed("realtime");
    expect(health.snapshot().realtime).toEqual({ status: "ok", mode: "distributed" });
  });
});
