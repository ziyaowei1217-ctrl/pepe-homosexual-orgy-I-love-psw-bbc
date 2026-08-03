import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AdminGuard } from "../src/auth/admin.guard";
import { AuthRateLimiter } from "../src/auth/auth-rate-limit";
import { AuthController } from "../src/auth/auth.controller";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

describe("administrator step-up HTTP routes", () => {
  let app: INestApplication;
  let jwt: JwtService;
  const auth = {
    requestCalls: [] as string[],
    verifyCalls: [] as Array<{ userId: string; email: string; code: string }>,
    async requestAdminStepUpCode(email: string) {
      this.requestCalls.push(email);
      return { email, expiresAt: new Date("2030-01-01T00:10:00.000Z") };
    },
    async verifyAdminStepUpCode(input: { userId: string; email: string; code: string }) {
      this.verifyCalls.push(input);
      return { accessToken: "step-up-token", reauthenticatedUntil: new Date("2030-01-01T00:30:00.000Z") };
    }
  };
  const rateLimiter = {
    calls: [] as Array<{ action: "send" | "verify"; purpose: "LOGIN" | "ADMIN_STEP_UP"; email: string }>,
    async enforce(action: "send" | "verify", purpose: "LOGIN" | "ADMIN_STEP_UP", input: { email: string }) {
      this.calls.push({ action, purpose, email: input.email });
    }
  };

  beforeEach(async () => {
    auth.requestCalls = [];
    auth.verifyCalls = [];
    rateLimiter.calls = [];
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      controllers: [AuthController],
      providers: [
        AuthGuard,
        AdminGuard,
        { provide: AuthService, useValue: auth },
        { provide: AuthRateLimiter, useValue: rateLimiter },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                where.id === "admin-1"
                  ? { id: "admin-1", email: "current-admin@example.com", role: "ADMIN" }
                  : null
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

  it("requests the code for the current administrator even when the body names another email", async () => {
    const token = await jwt.signAsync({ sub: "admin-1", email: "stale@example.com", role: "USER" });

    await request(app.getHttpServer())
      .post("/api/v1/auth/admin-step-up/email-code")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "other@example.com" })
      .expect(201);

    expect(auth.requestCalls).toEqual(["current-admin@example.com"]);
    expect(rateLimiter.calls).toEqual([
      { action: "send", purpose: "ADMIN_STEP_UP", email: "current-admin@example.com" }
    ]);
  });

  it("rejects a client-selected email and verifies against the current administrator identity", async () => {
    const token = await jwt.signAsync({ sub: "admin-1", email: "stale@example.com", role: "USER" });
    const http = request(app.getHttpServer());

    await http
      .post("/api/v1/auth/admin-step-up/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "other@example.com", code: "123456" })
      .expect(400);

    await http
      .post("/api/v1/auth/admin-step-up/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ code: " 123456 " })
      .expect(201);

    expect(auth.verifyCalls).toEqual([
      { userId: "admin-1", email: "current-admin@example.com", code: "123456" }
    ]);
    expect(rateLimiter.calls).toEqual([
      { action: "verify", purpose: "ADMIN_STEP_UP", email: "current-admin@example.com" }
    ]);
  });
});
