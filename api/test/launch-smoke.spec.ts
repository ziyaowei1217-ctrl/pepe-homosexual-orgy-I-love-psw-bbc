import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

const request = require("supertest") as (server: unknown) => any;

const runSmoke = process.env.RUN_DB_SMOKE === "1";
const describeSmoke = runSmoke ? describe : describe.skip;

describeSmoke("launch smoke against real PostgreSQL", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ownerEmail = `launch-owner-${runId}@example.com`;
  const adminEmail = `launch-admin-${runId}@example.com`;
  const signupEmail = `launch-signup-${runId}@example.com`;
  const roommateId = `launch-roommate-${runId}`;
  let ownerId = "";
  let adminId = "";
  let dealRoomId = "";

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? "dev-change-me";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

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

    prisma = app.get(PrismaService);
    jwt = app.get(JwtService);

    const owner = await prisma.user.create({ data: { email: ownerEmail, role: "USER" } });
    const admin = await prisma.user.create({ data: { email: adminEmail, role: "ADMIN" } });
    ownerId = owner.id;
    adminId = admin.id;
    await prisma.profile.create({
      data: {
        email: ownerEmail,
        displayName: "Launch Smoke Owner",
        school: "Northeastern",
        city: "Boston",
        role: "lister"
      }
    });

    await prisma.roommateProfile.create({
      data: {
        id: roommateId,
        name: "Launch Smoke Roommate",
        age: 24,
        role: "Smoke tester",
        image: "https://example.com/roommate.jpg",
        match: 91,
        budget: "$1,900/month",
        commute: "Fenway / Back Bay",
        tags: ["quiet", "verified"],
        localReciprocalLike: true
      }
    });
  });

  afterAll(async () => {
    if (prisma) {
      if (dealRoomId) {
        await prisma.tourRequest.deleteMany({ where: { dealRoomId } });
        await prisma.dealRoomMember.deleteMany({ where: { dealRoomId } });
      }
      if (ownerId) {
        await prisma.dealRoom.deleteMany({ where: { ownerId } });
        await prisma.roommateAction.deleteMany({ where: { userId: ownerId } });
        await prisma.listing.deleteMany({ where: { ownerId } });
      }
      await prisma.roommateProfile.deleteMany({ where: { id: roommateId } });
      await prisma.verificationCode.deleteMany({
        where: { email: { in: [ownerEmail, adminEmail, signupEmail] } }
      });
      await prisma.profile.deleteMany({
        where: { email: { in: [ownerEmail, adminEmail, signupEmail] } }
      });
      await prisma.user.deleteMany({
        where: { email: { in: [ownerEmail, adminEmail, signupEmail] } }
      });
    }

    if (app) await app.close();
  });

  it("requests a registration code against the real database", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/email-code")
      .send({ email: signupEmail })
      .expect(201);

    expect(response.body).toMatchObject({
      email: signupEmail
    });
    expect(response.body.devCode).toMatch(/^\d{6}$/);
  });

  it("runs the core HTTP flow against the real database", async () => {
    const http = request(app.getHttpServer());
    const ownerToken = await jwt.signAsync({ sub: ownerId, email: ownerEmail, role: "USER" });
    const adminToken = await jwt.signAsync({
      sub: adminId,
      email: adminEmail,
      role: "ADMIN",
      adminReauthenticatedAt: Math.floor(Date.now() / 1000)
    });

    await http.get("/api/v1/ready").expect(200).expect({
      status: "ok",
      checks: {
        database: "ok",
        realtime: { status: "ok", mode: "single-instance" },
        messageRateLimit: { status: "ok", mode: "single-instance" }
      }
    });

    const listingResponse = await http
      .post("/api/v1/listings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send(listingPayload())
      .expect(201);
    expect(listingResponse.body.status).toBe("DRAFT");

    await http.get(`/api/v1/listings/${listingResponse.body.id}`).expect(404);

    await http
      .post(`/api/v1/listings/${listingResponse.body.id}/submit`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body.status).toBe("SUBMITTED");
      });

    await http
      .post(`/api/v1/admin/listings/${listingResponse.body.id}/approve`)
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          status: "APPROVED",
          reviewerId: adminId
        });
      });

    await http
      .get(`/api/v1/listings/${listingResponse.body.id}`)
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          id: listingResponse.body.id,
          status: "APPROVED"
        });
      });

    const matchResponse = await http
      .post(`/api/v1/roommates/${roommateId}/actions`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ action: "LIKE" })
      .expect(201);
    expect(matchResponse.body.dealRoom.status).toBe("ACTIVE");

    const activeRoomsResponse = await http
      .get("/api/v1/deal-rooms/active")
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(200);
    expect(activeRoomsResponse.body).toHaveLength(1);
    dealRoomId = activeRoomsResponse.body[0].id;

    await http
      .post(`/api/v1/deal-rooms/${dealRoomId}/tour-requests`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => {
        expect(body).toMatchObject({
          dealRoomId,
          requesterId: ownerId,
          status: "REQUESTED"
        });
      });
  });
});

function listingPayload() {
  return {
    title: "Launch smoke verified sublet",
    area: "Boston - Fenway",
    image: "https://example.com/smoke-listing.jpg",
    price: 1900,
    originalPrice: 2200,
    beds: 2,
    baths: 1,
    commute: "12 minute walk to Northeastern",
    transit: "18 minutes by train to Back Bay",
    trust: ".edu verified",
    tags: ["smoke", "verified"],
    score: 4.85
  };
}
