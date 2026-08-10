import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { configureCors } from "../src/config/cors";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("marketplace database API", () => {
  let app: INestApplication;
  let token: string;

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
    configureCors(app, ["http://localhost:3000"]);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();

    token = await signIn(app, "owner@example.com");
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates and updates the authenticated user's private profile", async () => {
    const http = request(app.getHttpServer());

    await http
      .get("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          email: "owner@example.com",
          role: "renter",
          eduEmailVerified: false,
          phoneVerified: false
        });
      });

    await http
      .patch("/api/v1/profiles/me")
      .set("Authorization", `Bearer ${token}`)
      .send({
        displayName: "  Maya Chen  ",
        school: "USC",
        city: "LA",
        role: "both",
        wechat: "maya-private",
        instagram: "maya_public",
        bio: "Looking for a clean shared apartment."
      })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          email: "owner@example.com",
          displayName: "Maya Chen",
          school: "USC",
          city: "LA",
          role: "both",
          wechat: "maya-private"
        });
      });
  });

  it("stores roommate profiles and keeps protected classes out of the API contract", async () => {
    const http = request(app.getHttpServer());

    await http
      .post("/api/v1/roommate-profiles")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...roommateProfilePayload(),
        nationality: "not allowed"
      })
      .expect(400);

    const createdResponse = await http
      .post("/api/v1/roommate-profiles")
      .set("Authorization", `Bearer ${token}`)
      .send(roommateProfilePayload())
      .expect(201);

    expect(createdResponse.body).toMatchObject({
      school: "USC",
      city: "LA",
      budgetMin: 1200,
      budgetMax: 1800,
      preferredNeighborhoods: ["Koreatown", "DTLA"],
      status: "active"
    });

    await http
      .get("/api/v1/roommates")
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ name: "owner", commute: "LA", budget: "$1,200–$1,800/month" });
        expect(body[0]).not.toHaveProperty("ownerId");
      });

    await http
      .get("/api/v1/roommate-profiles?city=LA&school=USC")
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).not.toHaveProperty("nationality");
        expect(body[0]).not.toHaveProperty("race");
        expect(body[0]).not.toHaveProperty("religion");
      });
  });

  it("retires every legacy housing-listing collection and item operation", async () => {
    const http = request(app.getHttpServer());
    const expected = {
      statusCode: 410,
      code: "LEGACY_LISTINGS_RETIRED",
      message: "Legacy housing listings API has been retired",
      replacement: "/api/v1/listings"
    };
    const requestFactories = [
      () => http.get("/api/v1/housing-listings?city=LA"),
      () => http.get("/api/v1/housing-listings/legacy-id"),
      () => http.post("/api/v1/housing-listings").send({ ignored: true }),
      () => http.put("/api/v1/housing-listings/legacy-id").send({ title: "ignored" }),
      () =>
        http
          .patch("/api/v1/housing-listings/legacy-id")
          .set("Authorization", "Bearer invalid-token")
          .send({ status: "active" }),
      () => http.delete("/api/v1/housing-listings/legacy-id")
    ];

    for (const createRequest of requestFactories) {
      await createRequest().expect(410).expect(expected);
    }

    await http.head("/api/v1/housing-listings/legacy-id").expect(410);
    await http
      .options("/api/v1/housing-listings/legacy-id")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "PATCH")
      .expect("Access-Control-Allow-Origin", "http://localhost:3000")
      .expect(410)
      .expect(expected);

  });

  it("preserves successful CORS preflights for active APIs", async () => {
    await request(app.getHttpServer())
      .options("/api/v1/profiles/me")
      .set("Origin", "http://localhost:3000")
      .set("Access-Control-Request-Method", "GET")
      .expect("Access-Control-Allow-Origin", "http://localhost:3000")
      .expect(204);
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

function roommateProfilePayload() {
  return {
    school: "USC",
    city: "LA",
    budgetMin: 1200,
    budgetMax: 1800,
    moveInDate: "2026-08-15",
    moveOutDate: "2027-05-15",
    preferredNeighborhoods: ["Koreatown", "DTLA"],
    roomType: "private_room",
    cleanliness: "tidy",
    sleepSchedule: "night_owl",
    smoking: "no",
    pets: "ok",
    guests: "sometimes",
    intro: "Grad student looking for a calm home base.",
    lookingFor: "Respectful roommate near campus."
  };
}
