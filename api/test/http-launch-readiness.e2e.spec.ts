import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("backend launch readiness HTTP flow", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";

    const prisma = createLaunchPrismaMock();
    await prisma.roommateProfile.create({
      data: {
        id: "seed-roommate-1",
        name: "Mia Chen",
        age: 22,
        role: "Student",
        image: "https://example.com/mia.jpg",
        match: 96,
        budget: "$1,650/month",
        commute: "Fenway",
        tags: ["quiet"],
        localReciprocalLike: true
      }
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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

  it("proves the launch-critical API path over HTTP", async () => {
    const http = request(app.getHttpServer());

    await http.get("/api/v1/health").expect(200).expect({ status: "ok" });
    await http.get("/api/v1/ready").expect(200).expect({
      status: "ok",
      checks: { database: "ok" }
    });

    const codeResponse = await http
      .post("/api/v1/auth/email-code")
      .send({ email: "Owner@Example.com " })
      .expect(201);
    expect(codeResponse.body).toMatchObject({ email: "owner@example.com" });
    expect(codeResponse.body.devCode).toMatch(/^\d{6}$/);

    const sessionResponse = await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "owner@example.com", code: codeResponse.body.devCode })
      .expect(201);
    const ownerToken = sessionResponse.body.accessToken;
    expect(ownerToken).toEqual(expect.any(String));
    await http
      .patch("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        displayName: "Launch Owner",
        school: "Northeastern",
        city: "Boston",
        role: "lister"
      })
      .expect(200);

    const listingResponse = await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(listingPayload())
      .expect(201);
    expect(listingResponse.body).toMatchObject({
      ownerId: sessionResponse.body.user.id,
      status: "DRAFT",
      title: "Launch-ready Fenway sublet"
    });

    await http.get(`/api/v1/listings/${listingResponse.body.id}`).expect(404);

    const submittedResponse = await http
      .post(`/api/v1/listings/${listingResponse.body.id}/submit`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201);
    expect(submittedResponse.body).toMatchObject({ status: "SUBMITTED" });

    await http
      .post(`/api/v1/admin/listings/${listingResponse.body.id}/approve`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(403);

    const adminCodeResponse = await http
      .post("/api/v1/auth/email-code")
      .send({ email: "admin@example.com" })
      .expect(201);
    const adminSessionResponse = await http
      .post("/api/v1/auth/verify-email")
      .send({ email: "admin@example.com", code: adminCodeResponse.body.devCode })
      .expect(201);
    const adminToken = adminSessionResponse.body.accessToken;

    await http
      .post(`/api/v1/admin/listings/${listingResponse.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: "APPROVED",
          reviewerId: adminSessionResponse.body.user.id,
          rejectionReason: null
        });
      });

    await http
      .get(`/api/v1/listings/${listingResponse.body.id}`)
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          id: listingResponse.body.id,
          status: "APPROVED",
          title: "Launch-ready Fenway sublet"
        });
      });

    const matchResponse = await http
      .post("/api/v1/roommates/seed-roommate-1/actions")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ action: "LIKE" })
      .expect(201);
    expect(matchResponse.body.dealRoom).toMatchObject({
      status: "ACTIVE",
      canRequestTour: true
    });

    const activeRoomsResponse = await http
      .get("/api/v1/deal-rooms/active")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(activeRoomsResponse.body).toHaveLength(1);

    const firstTourResponse = await http
      .post(`/api/v1/deal-rooms/${activeRoomsResponse.body[0].id}/tour-requests`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201);
    const secondTourResponse = await http
      .post(`/api/v1/deal-rooms/${activeRoomsResponse.body[0].id}/tour-requests`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201);
    expect(secondTourResponse.body.id).toBe(firstTourResponse.body.id);
  });
});

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
