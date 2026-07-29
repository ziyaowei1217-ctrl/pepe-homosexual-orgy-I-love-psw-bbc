import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
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
      .get("/api/v1/roommate-profiles?city=LA&school=USC")
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).not.toHaveProperty("nationality");
        expect(body[0]).not.toHaveProperty("race");
        expect(body[0]).not.toHaveProperty("religion");
      });
  });

  it("stores housing listings, exposes only active public listings, and enforces owner updates", async () => {
    const http = request(app.getHttpServer());
    const otherToken = await signIn(app, "other@example.com");
    await completePublisherProfile(app, token);
    await completePublisherProfile(app, otherToken);

    const createdResponse = await http
      .post("/api/v1/housing-listings")
      .set("Authorization", `Bearer ${token}`)
      .send(housingListingPayload())
      .expect(201);

    expect(createdResponse.body).toMatchObject({
      title: "USC private room sublet",
      status: "draft",
      priceMonthly: 1650,
      photoUrls: ["https://example.com/room.jpg"]
    });

    await http.get("/api/v1/housing-listings").expect(200).expect([]);

    await http
      .patch(`/api/v1/housing-listings/${createdResponse.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ status: "active" })
      .expect(404);

    await http
      .patch(`/api/v1/housing-listings/${createdResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "active" })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.status).toBe("active");
      });

    await http
      .get("/api/v1/housing-listings?city=LA&schoolNearby=USC")
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          title: "USC private room sublet",
          status: "active"
        });
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

async function completePublisherProfile(app: INestApplication, token: string) {
  await request(app.getHttpServer())
    .patch("/api/v1/profiles/me")
    .set("Authorization", `Bearer ${token}`)
    .send({
      displayName: "Housing Owner",
      school: "USC",
      city: "LA",
      role: "lister"
    })
    .expect(200);
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

function housingListingPayload() {
  return {
    title: "USC private room sublet",
    listingType: "sublet",
    propertyType: "apartment",
    roomType: "private_room",
    priceMonthly: 1650,
    depositAmount: 1000,
    city: "LA",
    neighborhood: "Koreatown",
    schoolNearby: "USC",
    addressApprox: "Near Vermont Ave",
    lat: 34.0522,
    lng: -118.2437,
    moveInDate: "2026-08-15",
    moveOutDate: "2027-05-15",
    flexibleDates: true,
    bedrooms: 2,
    bathrooms: 1,
    furnished: true,
    utilitiesIncluded: false,
    laundry: true,
    parking: false,
    petsAllowed: true,
    leaseApproved: true,
    description: "Bright room with desk and closet.",
    photoUrls: ["https://example.com/room.jpg"]
  };
}
