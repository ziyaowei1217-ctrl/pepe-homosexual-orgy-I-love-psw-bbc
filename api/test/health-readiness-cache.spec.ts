import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { HealthService } from "../src/health/health.service";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

function fixture() {
  const messaging = new MessagingInfrastructureHealth();
  messaging.markDistributed("realtime");
  messaging.markDistributed("messageRateLimit");
  const realtimeProbe = vi.fn(async () => { messaging.markDistributed("realtime"); });
  const messageProbe = vi.fn(async () => { messaging.markDistributed("messageRateLimit"); });
  messaging.registerProbe("realtime", realtimeProbe);
  messaging.registerProbe("messageRateLimit", messageProbe);
  const authProbe = vi.fn(async () => undefined);
  const auth = new AuthInfrastructureHealth();
  auth.registerProbe(authProbe);
  const query = vi.fn<() => Promise<unknown>>().mockResolvedValue([{ ok: 1 }]);
  const service = new HealthService({ $queryRaw: query } as never, messaging, auth);
  return { service, query, messaging, realtimeProbe, messageProbe, authProbe };
}

function clock() {
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  return { advance(milliseconds: number) { now += milliseconds; } };
}

describe("production readiness probe cache", () => {
  it("coalesces concurrent callers and repeated host polling into one dependency probe per minute", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const time = clock();
    const { service, query, authProbe, realtimeProbe, messageProbe } = fixture();
    let release!: () => void;
    query.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const concurrent = Array.from({ length: 20 }, () => service.ready());
    expect(query).toHaveBeenCalledTimes(1);
    expect(authProbe).toHaveBeenCalledTimes(1);
    release();
    expect((await Promise.all(concurrent)).every(value => (value as { status: string }).status === "ok")).toBe(true);
    for (let polling = 0; polling < 11; polling++) {
      time.advance(5_000);
      await Promise.all(Array.from({ length: 20 }, () => service.ready()));
    }
    for (const probe of [query, authProbe, realtimeProbe, messageProbe]) expect(probe).toHaveBeenCalledTimes(1);
    time.advance(5_000);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    for (const probe of [query, authProbe, realtimeProbe, messageProbe]) expect(probe).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired success and reports an authentication outage instead of stale readiness", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const time = clock();
    const { service, query, authProbe } = fixture();
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    authProbe.mockRejectedValue(new Error("private provider failure"));
    time.advance(59_999);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(authProbe).toHaveBeenCalledTimes(1);
    time.advance(1);
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await service.ready().catch(error => {
      expect(error.getResponse().checks.authRateLimit.status).toBe("error");
      expect(JSON.stringify(error.getResponse())).not.toContain("private");
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(authProbe).toHaveBeenCalledTimes(2);
  });

  it("caches failures for five seconds, then discovers recovery without a message or login", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const time = clock();
    const { service, query, authProbe, realtimeProbe, messageProbe } = fixture();
    authProbe.mockRejectedValueOnce(new Error("unavailable"));
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    time.advance(4_999);
    await Promise.all(Array.from({ length: 20 }, () => expect(service.ready()).rejects.toMatchObject({ status: 503 })));
    for (const probe of [query, authProbe, realtimeProbe, messageProbe]) expect(probe).toHaveBeenCalledTimes(1);
    time.advance(1);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    for (const probe of [query, authProbe, realtimeProbe, messageProbe]) expect(probe).toHaveBeenCalledTimes(2);
  });

  it("invalidates cached success when an operation reports degraded messaging", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const time = clock();
    const { service, query, messaging, realtimeProbe } = fixture();
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    realtimeProbe.mockRejectedValueOnce(new Error("connection lost"));
    messaging.markLocalFallback("realtime", "connection");
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    expect(query).toHaveBeenCalledTimes(2);
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    expect(query).toHaveBeenCalledTimes(2);
    time.advance(5_000);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("keeps each caller bounded while retaining one stalled underlying check beyond caller timeouts", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const { service, query, authProbe, realtimeProbe, messageProbe } = fixture();
    let release!: () => void;
    query.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = service.ready().catch(error => error.getStatus());
    const second = service.ready().catch(error => error.getStatus());
    await vi.advanceTimersByTimeAsync(3_499);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe(503);
    expect(await second).toBe(503);
    await vi.advanceTimersByTimeAsync(60_000);
    const later = service.ready().catch(error => error.getStatus());
    await vi.advanceTimersByTimeAsync(3_500);
    expect(await later).toBe(503);
    for (const probe of [query, authProbe, realtimeProbe, messageProbe]) expect(probe).toHaveBeenCalledTimes(1);
    const recovering = service.ready();
    release();
    await expect(recovering).resolves.toMatchObject({ status: "ok" });
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("checks dependencies on every non-production request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { service, query, authProbe } = fixture();
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    query.mockRejectedValueOnce(new Error("database offline"));
    await expect(service.ready()).rejects.toMatchObject({ status: 503 });
    await expect(service.ready()).resolves.toMatchObject({ status: "ok" });
    expect(query).toHaveBeenCalledTimes(3);
    expect(authProbe).not.toHaveBeenCalled();
  });
});
