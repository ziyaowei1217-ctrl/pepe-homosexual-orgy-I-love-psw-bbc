import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
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
  let prisma: ReturnType<typeof createLaunchPrismaMock>;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";
    prisma = createLaunchPrismaMock();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
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

  it("clears nullable private profile fields while preserving omitted fields", async () => {
    const http = request(app.getHttpServer());
    const path = "/api/v1/profiles/me";
    await http.patch(path).set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Maya", school: "UCLA", city: "LA", bio: "Previous bio", wechat: "private", avatarUrl: "https://example.com/avatar.jpg" }).expect(200);
    await http.patch(path).set("Authorization", `Bearer ${token}`)
      .send({ bio: null, avatarUrl: null, city: null }).expect(200);
    const result = await http.get(path).set("Authorization", `Bearer ${token}`).expect(200);
    expect(result.body).toMatchObject({ bio: null, avatarUrl: null, city: null, displayName: "Maya", school: "UCLA", wechat: "private", role: "renter" });
  });

  it("stores roommate profiles and keeps protected classes out of the API contract", async () => {
    const http = request(app.getHttpServer());
    const { age: _age, ...payloadWithoutAge } = roommateProfilePayload();

    await http
      .post("/api/v1/roommate-profiles")
      .set("Authorization", `Bearer ${token}`)
      .send(payloadWithoutAge)
      .expect(400);

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
        expect(body[0]).toMatchObject({ name: "owner", age: 26, commute: "LA", budget: "$1,200–$1,800/month" });
        expect(body[0]).not.toHaveProperty("ownerId");
        expect(body[0]).not.toHaveProperty("localReciprocalLike");
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

    for (const patch of [{ budgetMin: 1900 }, { budgetMax: 1000 }]) {
      await http.patch(`/api/v1/roommate-profiles/${createdResponse.body.id}`)
        .set("Authorization", `Bearer ${token}`).send(patch).expect(400);
    }

    await http
      .patch(`/api/v1/roommate-profiles/${createdResponse.body.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "matched" })
      .expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body.status).toBe("matched"));

    await http.get("/api/v1/roommates").expect(200).expect([]);
    await http.get("/api/v1/roommate-profiles?city=LA&school=USC").expect(200).expect([]);
  });

  it("rejects null for the non-nullable profile role without changing the saved role", async () => {
    const http = request(app.getHttpServer());
    await http.patch("/api/v1/profiles/me").set("Authorization", `Bearer ${token}`)
      .send({ role: "both" }).expect(200);
    await http.patch("/api/v1/profiles/me").set("Authorization", `Bearer ${token}`)
      .send({ role: null }).expect(400);
    const result = await http.get("/api/v1/profiles/me").set("Authorization", `Bearer ${token}`).expect(200);
    expect(result.body.role).toBe("both");
  });

  it("keeps archived roommate preferences private on both public endpoints even for inconsistent historical rows", async () => {
    const http = request(app.getHttpServer());
    const created = await http.post("/api/v1/roommate-profiles").set("Authorization", `Bearer ${token}`)
      .send({ ...roommateProfilePayload(), intro: "Archived member introduction" }).expect(201);
    const cards = await http.get("/api/v1/roommates").expect(200);
    await http.get("/api/v1/roommate-profiles").expect(200).expect((response: any) => expect(response.body).toHaveLength(1));
    const jwt = app.get(JwtService);
    const adminSession = await signIn(app, "admin@example.com");
    const admin = await jwt.verifyAsync(adminSession);
    const adminToken = await jwt.signAsync({ sub: admin.sub, email: admin.email, role: "ADMIN", adminReauthenticatedAt: Math.floor(Date.now() / 1000) });
    await http.post(`/api/v1/admin/roommates/${cards.body[0].id}/archive`).set("Authorization", `Bearer ${adminToken}`).expect(201);
    // This is the persisted mismatch that existed before the fix: archive
    // changes the owned card while the raw matching profile remains active.
    const raw = await prisma.roommateMatchingProfile.findMany();
    expect(raw.find(profile => profile.id === created.body.id)).toMatchObject({ status: "active", intro: "Archived member introduction" });
    await http.get("/api/v1/roommates").expect(200).expect([]);
    await http.get("/api/v1/roommate-profiles").expect(200).expect([]);
    await http.get("/api/v1/roommate-profiles").query({ city: "LA", school: "USC" }).expect(200).expect([]);
    await http.get("/api/v1/roommate-profiles").query({ city: "LA' OR 1=1 --" }).expect(200).expect([]);
    await prisma.roommateProfile.update({ where: { id: cards.body[0].id }, data: { status: "active" } });
    await http.get("/api/v1/roommates").expect(200).expect([]);
    await http.get("/api/v1/roommate-profiles").expect(200).expect([]);
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
    age: 26,
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
