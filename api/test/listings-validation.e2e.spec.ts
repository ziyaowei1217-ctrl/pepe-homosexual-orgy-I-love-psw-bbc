import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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
    adminToken = await signInAsAdmin(app, "admin@example.com");
    await completePublisherProfile(app, token);
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects explicit null for every non-null optional PATCH field", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    for (const field of ["title", "area", "price", "originalPrice", "beds", "baths", "commute", "transit", "trust", "tags", "score", "availableFrom", "availableTo"]) {
      await http.patch(`/api/v1/listings/${created.id}`).set("Authorization", `Bearer ${token}`).send({ [field]: null }).expect(400);
    }
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

  it("requires a valid increasing availability range", async () => {
    const http = request(app.getHttpServer());
    const { availableFrom: _from, availableTo: _to, ...withoutAvailability } = listingPayload();

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send(withoutAvailability)
      .expect(400);

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...listingPayload(),
        availableFrom: "2026-09-20",
        availableTo: "2026-08-20"
      })
      .expect(400);
  });

  it("rejects incomplete or malformed public date queries", async () => {
    const http = request(app.getHttpServer());

    await http.get("/api/v1/listings?moveIn=2026-08-20").expect(400);
    await http.get("/api/v1/listings?moveOut=2026-09-20").expect(400);
    await http
      .get("/api/v1/listings?moveIn=2026-09-20&moveOut=2026-08-20")
      .expect(400);
    await http
      .get("/api/v1/listings?moveIn=2026-02-30&moveOut=2026-09-20")
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

  it("creates a draft without a client-supplied image URL", async () => {
    const http = request(app.getHttpServer());
    const { image: _legacyImage, ...payload } = listingPayload();

    await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${token}`)
      .send(payload)
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.image).toBeNull();
      });
  });

  it("retires the legacy URL metadata route from the full application", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);

    await http
      .post(`/api/v1/listings/${created.id}/media`)
      .set("Authorization", `Bearer ${token}`)
      .send(mediaPayload())
      .expect(404);
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

  it.each(["approve", "reject"])("requires the reviewed revision for admin %s", async (decision) => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    await http.post(`/api/v1/listings/${created.id}/submit`).set("Authorization", `Bearer ${token}`).expect(201);
    const queue = await http.get("/api/v1/admin/listings/review-queue")
      .set("Authorization", `Bearer ${adminToken}`).expect(200);
    const reviewed = queue.body.find((item: { id: string }) => item.id === created.id);
    for (const revision of [undefined, -1, 1.5, "0"]) {
      await http.post(`/api/v1/admin/listings/${created.id}/${decision}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ revision, ...(decision === "reject" ? { reason: "Needs changes" } : {}) })
        .expect(400);
    }
    await http.post(`/api/v1/admin/listings/${created.id}/${decision}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ revision: reviewed.revision, ...(decision === "reject" ? { reason: "Needs changes" } : {}) })
      .expect(201);
  });

  it("validates and trims admin rejection reasons", async () => {
    const http = request(app.getHttpServer());
    const created = await createListing(http, token);
    const submitted = await http.post(`/api/v1/listings/${created.id}/submit`).set("Authorization", `Bearer ${token}`).expect(201);

    await http
      .post(`/api/v1/admin/listings/${created.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        revision: submitted.body.revision,
        reason: "   "
      })
      .expect(400);

    await http
      .post(`/api/v1/admin/listings/${created.id}/reject`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        revision: submitted.body.revision,
        reason: "  Needs clearer bedroom photos  "
      })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.rejectionReason).toBe("Needs clearer bedroom photos");
      });
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

async function signInAsAdmin(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const codeResponse = await http.post("/api/v1/auth/email-code").send({ email }).expect(201);
  const sessionResponse = await http
    .post("/api/v1/auth/verify-email")
    .send({ email, code: codeResponse.body.devCode })
    .expect(201);
  const jwt = app.get(JwtService);
  const adminId = sessionResponse.body.user.id as string;
  const adminEmail = sessionResponse.body.user.email as string;
  return jwt.signAsync({
    sub: adminId,
    email: adminEmail,
    role: "ADMIN",
    adminReauthenticatedAt: Math.floor(Date.now() / 1000)
  });
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
  const { image: _legacyImage, ...payload } = listingPayload();
  const response = await http.post("/api/v1/listings").set("Authorization", `Bearer ${token}`).send(payload).expect(201);
  return response.body as { id: string };
}

function listingPayload() {
  return {
    title: "Launch-ready Fenway sublet",
    area: "Boston - Fenway",
    image: "https://example.com/fenway.jpg",
    availableFrom: "2026-08-20",
    availableTo: "2026-12-31",
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
