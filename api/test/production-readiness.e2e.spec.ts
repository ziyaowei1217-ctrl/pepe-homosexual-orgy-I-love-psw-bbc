import "reflect-metadata";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthInfrastructureHealth } from "../src/health/auth-infrastructure-health";
import { HealthModule } from "../src/health/health.module";
import { MessagingInfrastructureHealth } from "../src/health/messaging-infrastructure-health";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

describe("production readiness HTTP policy", () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns 503 for required distributed outages and 200 after recovery without changing liveness", async () => {
    vi.stubEnv("NODE_ENV", "production");
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, HealthModule] })
      .overrideProvider(PrismaService).useValue({ $queryRaw: async () => [{ ok: 1 }] }).compile();
    const messaging = moduleRef.get(MessagingInfrastructureHealth);
    const authentication = moduleRef.get(AuthInfrastructureHealth);
    messaging.markDistributed("realtime");
    messaging.markDistributed("messageRateLimit");
    let authAvailable = false;
    authentication.registerProbe(async () => {
      if (!authAvailable) throw new Error("credential-bearing provider fault");
    });
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    const http = request(app.getHttpServer());

    await http.get("/api/v1/health").expect(200).expect({ status: "ok" });
    const failed = await http.get("/api/v1/ready").expect(503);
    expect(failed.body.checks).toMatchObject({ database: "ok", authRateLimit: { status: "error" } });
    expect(JSON.stringify(failed.body)).not.toContain("credential");
    authAvailable = true;
    now += 5_000;
    await http.get("/api/v1/ready").expect(200);
    messaging.markLocalFallback("messageRateLimit", "timeout");
    await http.get("/api/v1/ready").expect(503);
    messaging.markDistributed("messageRateLimit");
    now += 5_000;
    await http.get("/api/v1/ready").expect(200);
  });
});
