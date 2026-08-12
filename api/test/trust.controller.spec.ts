import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminGuard } from "../src/auth/admin.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { PrismaService } from "../src/prisma/prisma.service";
import { TrustController } from "../src/trust/trust.controller";
import { TrustService } from "../src/trust/trust.service";

const request = require("supertest") as (server: unknown) => any;

describe("TrustController guard metadata", () => {
  it("requires an authenticated administrator for Trust queue reads", () => {
    expect(Reflect.getMetadata("__guards__", TrustController) ?? []).toEqual([
      AuthGuard,
      AdminGuard
    ]);
  });
});

describe("TrustController HTTP authorization", () => {
  let app: INestApplication;
  let jwt: JwtService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      controllers: [TrustController],
      providers: [
        TrustService,
        AuthenticatedUserService,
        AuthGuard,
        AdminGuard,
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                users[where.id] ?? null
            },
            trustQueueItem: {
              findMany: async () => [{ id: "queue-1", label: "Review ID" }]
            }
          }
        }
      ]
    }).compile();

    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 when the Trust queue is read without a bearer token", async () => {
    await request(app.getHttpServer()).get("/api/v1/trust/queues").expect(401);
  });

  it("returns 403 when an ordinary user reads the Trust queue", async () => {
    const token = await jwt.signAsync({ sub: "user-1" });

    await request(app.getHttpServer())
      .get("/api/v1/trust/queues")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("returns the Trust queue to an administrator", async () => {
    const token = await jwt.signAsync({ sub: "admin-1" });

    await request(app.getHttpServer())
      .get("/api/v1/trust/queues")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect([{ id: "queue-1", label: "Review ID" }]);
  });
});

const users: Record<string, { id: string; email: string; role: string }> = {
  "user-1": { id: "user-1", email: "user@example.com", role: "USER" },
  "admin-1": { id: "admin-1", email: "admin@example.com", role: "ADMIN" }
};
