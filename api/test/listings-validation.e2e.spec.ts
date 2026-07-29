import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("listing HTTP validation", () => {
  let app: INestApplication;
  let token: string;
  let adminToken: string;

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

    token = await signIn(app, "owner@example.com");
    adminToken = await signIn(app, "admin@example.com");
    await completePublisherProfile(app, token);
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects malformed listing create payloads", async () => {
    const http = request(app.getHttpServer());

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        title: "   "
      })
      .expect(400);

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        image: "not-a-url"
      })
      .expect(400);

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        beds: 1.5
      })
      .expect(400);

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        tags: []
      })
      .expect(400);
  });

  it("rejects server-owned listing fields at the HTTP boundary", async () => {
    const http = request(app.getHttpServer());

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        status: "APPROVED"
      })
      .expect(400);
  });

  it("allows trimmed partial updates and rejects empty updates", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);

    await http.patch(`/api/v1/listings/${created.id}`).set("Authorization", `Bearer ${token}`).send({}).expect(400);

    await http
      .patch(`/api/v1/listings/${created.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        title: "  Updated Fenway room  "
      })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.title).toBe("Updated Fenway room");
      });
  });

  it("validates and trims admin rejection reasons", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    await http.post(`/api/v1/listings/${created.id}/submit`).set("Authorization", `Bearer ${token}`).expect(201);

    await http
      .post(`/api/v1/admin/listings/${created.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "   "
      })
      .expect(400);

    await http
      .post(`/api/v1/admin/listings/${created.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        reason: "  Needs clearer bedroom photos  "
      })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.rejectionReason).toBe("Needs clearer bedroom photos");
      });
  });

  it("validates listing media payloads and stores owner media", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        url: "not-a-url",
        kind: "bedroom"
      })
      .expect(400);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        url: "https://example.com/bedroom.jpg",
        kind: "   "
      })
      .expect(400);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        url: "https://example.com/bedroom.jpg",
        kind: "bedroom",
        extra: true
      })
      .expect(400);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        url: "https://example.com/bedroom.jpg",
        kind: "bedroom",
        sortOrder: 1.5
      })
      .expect(400);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        url: " https://example.com/bedroom.jpg ",
        kind: " bedroom ",
        sortOrder: 2
      })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          listingId: created.id,
          url: "https://example.com/bedroom.jpg",
          kind: "bedroom",
          sortOrder: 2
        });
      });
  });

  it("hides listing media creation from non-owners and blocks submitted listings", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    const otherToken = await signIn(app, "other@example.com");

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send(mediaPayload())
      .expect(404);

    await http.post(`/api/v1/listings/${created.id}/submit`).set("Authorization", `Bearer ${token}`).expect(201);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send(mediaPayload())
      .expect(400);
  });
});

async function signIn(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const codeResponse = await http.post("/api/v1/auth/email-code").send({ email }).expect(201);
  const sessionResponse = await http
    .post("/api/v1/auth/verify-email")
    .send({ email, code: codeResponse.body.devCode })
    .expect(201);
  return sessionResponse.body.accessToken as string;
}

async function completePublisherProfile(app: INestApplication, token: string) {
  await request(app.getHttpServer())
    .patch("/api/v1/profiles/me")
    .set("Authorization", `Bearer ${token}`)
    .send({
      displayName: "Listing Owner",
      school: "Northeastern",
      city: "Boston",
      role: "lister"
    })
    .expect(200);
}

async function createListing(http: ReturnType<typeof request>, token: string) {
  const response = await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send(listingPayload()).expect(201);
  return response.body as { id: string };
}

function listingPayload() {
  return {
    title: "Launch-ready Fenway sublet",
    area: "Boston - Fenway",
    image: "https://example.com/fenway.jpg",
    price: 1800,
    originalPrice: 2100,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes by train to Back Bay",
    trust: ".edu verified",
    tags: ["video tour", "verified"],
    score: 4.9
  };
}

function mediaPayload() {
  return {
    url: "https://example.com/bedroom.jpg",
    kind: "bedroom",
    sortOrder: 1
  };
}
