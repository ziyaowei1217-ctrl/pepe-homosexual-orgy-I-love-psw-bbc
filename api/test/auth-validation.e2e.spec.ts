import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("auth HTTP validation", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects malformed email-code requests", async () => {
    const http = request(app.getHttpServer());

    await http.post("/api/v1/auth/email-code").send({ email: "not-an-email" }).expect(400);
    await http.post("/api/v1/auth/email-code").send({ email: "   " }).expect(400);
    await http.post("/api/v1/auth/email-code").send({ email: "owner@example.com", role: "ADMIN" }).expect(400);
  });

  it("rejects malformed verify-email requests without consuming the valid code", async () => {
    const http = request(app.getHttpServer());
    const codeResponse = await http.post("/api/v1/auth/email-code").send({ email: "owner@example.com" }).expect(201);

    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: "abc123" })
      .expect(400);
    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: "12345" })
      .expect(400);
    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: codeResponse.body.devCode, extra: true })
      .expect(400);

    await http
      .post("/api/v1/auth/verify-email")
      .send({ email: " owner@example.com ", code: ` ${codeResponse.body.devCode} ` })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.accessToken).toEqual(expect.any(String));
      });
  });
});
