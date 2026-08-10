import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { AuthRateLimiter, InMemoryRateLimitStore, type RateLimitStore } from "../src/auth/auth-rate-limit";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { AUTH_SECURITY_CONFIG } from "../src/auth/auth.module";
import { AuthController } from "../src/auth/auth.controller";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthService } from "../src/auth/auth.service";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

describe("auth HTTP abuse controls", () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns 429, Retry-After, and AUTH_RATE_LIMITED for send limits", async () => {
    app = await createApp(new InMemoryRateLimitStore());
    const http = request(app.getHttpServer());
    for (let index = 0; index < 5; index += 1) {
      await http
        .post("/api/v1/auth/email-code")
        .set("X-Device-ID", `550e8400-e29b-41d4-a716-${String(index).padStart(12, "0")}`)
        .send({ email: "student@example.com" })
        .expect(201);
    }
    await http
      .post("/api/v1/auth/email-code")
      .set("X-Device-ID", "550e8400-e29b-41d4-a716-999999999999")
      .send({ email: "student@example.com" })
      .expect(429)
      .expect("Retry-After", /\d+/)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({ code: "AUTH_RATE_LIMITED" });
      });
  });

  it("returns generic 503 for production rate-store failures", async () => {
    const store: RateLimitStore = {
      async consume() {
        throw new Error("valkey host and credential detail");
      }
    };
    app = await createApp(store);

    await request(app.getHttpServer())
      .post("/api/v1/auth/verify-email")
      .send({ email: "student@example.com", code: "123456" })
      .expect(503)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({ code: "AUTH_DELIVERY_UNAVAILABLE" });
        expect(JSON.stringify(body)).not.toContain("valkey");
        expect(JSON.stringify(body)).not.toContain("credential");
      });
  });

  async function createApp(store: RateLimitStore) {
    const auth = {
      async requestEmailCode(email: string) {
        return { email: email.toLowerCase(), expiresAt: new Date("2030-01-01T00:00:00.000Z") };
      },
      async verifyEmailCode() {
        return { accessToken: "token", user: { id: "user-1", email: "student@example.com", role: "USER" } };
      }
    };
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: AuthenticatedUserService, useValue: {} },
        { provide: AuthGuard, useValue: { canActivate: () => true } },
        { provide: PrismaService, useValue: {} },
        {
          provide: AuthRateLimiter,
          useValue: new AuthRateLimiter({ store, identifierHashSecret: "identifier-secret", nodeEnv: "production" })
        },
        {
          provide: AUTH_SECURITY_CONFIG,
          useValue: {
            trustedProxyHops: 0,
            otpHashSecret: "otp-secret",
            securityIdentifierHashSecret: "identifier-secret",
            codeTtlMs: 600_000,
            codeMaxAttempts: 5,
            codeCooldownMs: 60_000
          }
        }
      ]
    }).compile();
    const testApp = moduleRef.createNestApplication();
    testApp.setGlobalPrefix("api/v1");
    await testApp.init();
    return testApp;
  }
});
