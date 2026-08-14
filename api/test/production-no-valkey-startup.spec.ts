import "reflect-metadata";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { afterEach, describe, expect, it } from "vitest";

import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("production startup without Valkey", () => {
  let app: INestApplication | undefined;
  const originalEnvironment = new Map<string, string | undefined>();

  afterEach(async () => {
    await app?.close();
    app = undefined;
    for (const [name, value] of originalEnvironment) restoreEnvironment(name, value);
    originalEnvironment.clear();
  });

  it("boots the real application in bounded single-instance mode", async () => {
    setEnvironment("NODE_ENV", "production");
    setEnvironment("JWT_SECRET", "production-jwt-secret-for-no-valkey-startup");
    setEnvironment("OTP_HASH_SECRET", "production-otp-secret-for-no-valkey-startup");
    setEnvironment("SECURITY_IDENTIFIER_HASH_SECRET", "production-identifier-secret-for-no-valkey-startup");
    setEnvironment("EMAIL_SENDER", "resend");
    setEnvironment("RESEND_API_KEY", "production-resend-key");
    setEnvironment("EMAIL_FROM", "Sublet Pipeline <no-reply@example.com>");
    setEnvironment("LOCAL_ADMIN_EMAILS", "");
    setEnvironment("VALKEY_URL", "");
    setEnvironment("LISTING_MEDIA_STORAGE_ENDPOINT", "https://minio.example.com");
    setEnvironment("LISTING_MEDIA_UPLOAD_ENDPOINT", "https://uploads.example.com");
    setEnvironment("LISTING_MEDIA_STORAGE_REGION", "us-east-1");
    setEnvironment("LISTING_MEDIA_STORAGE_BUCKET", "listing-media");
    setEnvironment("LISTING_MEDIA_STORAGE_ACCESS_KEY_ID", "production-minio-key");
    setEnvironment("LISTING_MEDIA_STORAGE_SECRET_ACCESS_KEY", "production-minio-secret");

    const [{ AppModule }, { MessagingInfrastructureHealth }, { PrismaService }, { createRoommateSocketAdapter }] =
      await Promise.all([
        import("../src/app.module"),
        import("../src/health/messaging-infrastructure-health"),
        import("../src/prisma/prisma.service"),
        import("../src/roommate-conversations/socket-adapter")
      ]);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    const config = app.get(ConfigService);
    const health = app.get(MessagingInfrastructureHealth);
    const socketAdapter = await createRoommateSocketAdapter(app, {
      valkeyUrl: config.get<string>("VALKEY_URL"),
      health
    });
    expect(socketAdapter).toBeUndefined();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, "127.0.0.1");

    await request(app.getHttpServer()).get("/api/v1/health").expect(200).expect({ status: "ok" });
    await request(app.getHttpServer()).get("/api/v1/ready").expect(200).expect({
      status: "ok",
      checks: {
        database: "ok",
        realtime: { status: "ok", mode: "single-instance" },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      }
    });
  });

  function setEnvironment(name: string, value: string) {
    if (!originalEnvironment.has(name)) originalEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
