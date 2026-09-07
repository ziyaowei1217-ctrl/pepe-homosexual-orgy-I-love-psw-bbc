import "reflect-metadata";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { expect, it } from "vitest";

import { AuthController } from "../src/auth/auth.controller";
import { AuthService } from "../src/auth/auth.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { AdminGuard } from "../src/auth/admin.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { AuthRateLimiter } from "../src/auth/auth-rate-limit";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

it("preserves valid credentials across a user lookup outage without misreporting HTTP 401", async () => {
  let unavailable = false;
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: "auth-outage-test-secret" })],
    controllers: [AuthController],
    providers: [
      AuthGuard, AdminGuard, AuthenticatedUserService,
      { provide: AuthService, useValue: {} },
      { provide: AuthRateLimiter, useValue: {} },
      { provide: PrismaService, useValue: { user: { findUnique: async () => {
        if (unavailable) throw Object.assign(new Error("Test database unavailable"), { code: "P1001" });
        return { id: "user-1", email: "user@example.test", role: "USER" };
      } } } }
    ]
  }).compile();
  const app = moduleRef.createNestApplication();
  app.useLogger(false);
  app.setGlobalPrefix("api/v1");
  try {
    await app.init();
    const token = await moduleRef.get(JwtService).signAsync({ sub: "user-1" }, { expiresIn: "1h" });
    const http = request(app.getHttpServer());
    const before = await http.get("/api/v1/auth/me").auth(token, { type: "bearer" });
    unavailable = true;
    const during = await http.get("/api/v1/auth/me").auth(token, { type: "bearer" });
    unavailable = false;
    const recovered = await http.get("/api/v1/auth/me").auth(token, { type: "bearer" });

    expect([before.status, during.status, recovered.status]).toEqual([200, 500, 200]);
    expect(recovered.body).toEqual(before.body);
    expect(during.body).toEqual({ message: "Internal server error", statusCode: 500 });
    await http.get("/api/v1/auth/me").auth("invalid-token", { type: "bearer" }).expect(401);
  } finally {
    await app.close();
  }
});
