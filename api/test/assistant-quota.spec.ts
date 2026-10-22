import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AssistantController } from "../src/assistant/assistant.controller";
import { InMemoryRateLimitStore, type RateLimitStore } from "../src/auth/auth-rate-limit";
import { AuthGuard } from "../src/auth/auth.guard";
import { AUTH_RATE_LIMIT_STORE } from "../src/auth/auth.tokens";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

describe("assistant quota", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let store: RateLimitStore;

  async function start(rateLimitStore: RateLimitStore) {
    store = rateLimitStore;
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      controllers: [AssistantController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        { provide: AUTH_RATE_LIMIT_STORE, useFactory: () => store },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async ({ where }: { where: { id: string } }) =>
                where.id.startsWith("user-") ? { id: where.id, email: `${where.id}@example.com`, role: "USER" } : null
            }
          }
        }
      ]
    }).compile();
    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  }

  const tokenFor = (userId: string) => jwt.signAsync({ sub: userId, email: `${userId}@example.com`, role: "USER" });

  beforeEach(() => start(new InMemoryRateLimitStore()));
  afterEach(() => app.close());

  it("requires a session", async () => {
    await request(app.getHttpServer()).post("/api/v1/assistant/quota/chat").expect(401);
  });

  it("returns the user id until the per-user limit, then 429 with Retry-After", async () => {
    const token = await tokenFor("user-1");
    const http = request(app.getHttpServer());
    for (let index = 0; index < 20; index += 1) {
      await http.post("/api/v1/assistant/quota/chat").set("Authorization", `Bearer ${token}`).expect(200, { userId: "user-1" });
    }
    const limited = await http.post("/api/v1/assistant/quota/chat").set("Authorization", `Bearer ${token}`).expect(429);
    expect(limited.body.code).toBe("ASSISTANT_RATE_LIMITED");
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);

    // Other users and the listing writer have their own counts.
    await http.post("/api/v1/assistant/quota/chat").set("Authorization", `Bearer ${await tokenFor("user-2")}`).expect(200);
    await http.post("/api/v1/assistant/quota/listing-copy").set("Authorization", `Bearer ${token}`).expect(200);
  });

  it("rejects unknown kinds and reports a broken store as unavailable", async () => {
    const token = await tokenFor("user-1");
    await request(app.getHttpServer()).post("/api/v1/assistant/quota/toString").set("Authorization", `Bearer ${token}`).expect(404);

    await app.close();
    await start({ consume: async () => { throw new Error("valkey down"); } });
    const response = await request(app.getHttpServer())
      .post("/api/v1/assistant/quota/chat")
      .set("Authorization", `Bearer ${await tokenFor("user-1")}`)
      .expect(503);
    expect(response.body.code).toBe("ASSISTANT_UNAVAILABLE");
  });
});
