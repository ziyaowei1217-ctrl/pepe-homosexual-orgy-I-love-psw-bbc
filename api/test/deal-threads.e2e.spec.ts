import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("two-sided deal thread HTTP API", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => app.close());

  it("supports renter-to-host messages and host viewing confirmation", async () => {
    const http = request(app.getHttpServer());
    const host = await signIn(app, "host@example.com");
    const admin = await signInAsAdmin(app, "admin@example.com");
    const renter = await signIn(app, "renter@example.com");
    const unrelated = await signIn(app, "other@example.com");
    await completePublisherProfile(app, host.token);

    const listing = await createApprovedListing(http, host, admin);
    const created = await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${renter.token}`)
      .send({ listingId: listing.id })
      .expect(201);

    expect(created.body).toMatchObject({
      ownerId: renter.user.id,
      listingOwnerId: host.user.id,
      listingId: listing.id,
      listingTitle: "Service-backed Westwood room",
      viewerRole: "renter"
    });

    await http
      .post(`/api/v1/deal-threads/${created.body.id}/messages`)
      .set("Authorization", `Bearer ${renter.token}`)
      .send({ body: "Can I tour Friday?" })
      .expect(201);

    const hostInbox = await http
      .get("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${host.token}`)
      .expect(200);
    expect(hostInbox.body).toHaveLength(1);
    expect(hostInbox.body[0]).toMatchObject({ id: created.body.id, viewerRole: "host" });
    expect(hostInbox.body[0].messages[0]).toMatchObject({ body: "Can I tour Friday?", align: "left" });

    const hostReply = await http
      .post(`/api/v1/deal-threads/${created.body.id}/messages`)
      .set("Authorization", `Bearer ${host.token}`)
      .send({ body: "Friday works." })
      .expect(201);
    expect(hostReply.body.messages.at(-1)).toMatchObject({ body: "Friday works.", align: "right" });

    const viewing = await http
      .post(`/api/v1/deal-threads/${created.body.id}/viewing-requests`)
      .set("Authorization", `Bearer ${renter.token}`)
      .send({
        iso: "2026-08-21T12:00:00.000Z",
        mode: "in-person",
        participantNames: ["Renter"],
        timeLabel: "Aug 21 12:00"
      })
      .expect(201);
    const viewingId = viewing.body.viewingRequests[0].id;

    const confirmed = await http
      .post(`/api/v1/deal-threads/${created.body.id}/viewing-requests/${viewingId}/confirm`)
      .set("Authorization", `Bearer ${host.token}`)
      .expect(201);
    expect(confirmed.body.viewingRequests[0].status).toBe("CONFIRMED");

    await http
      .post(`/api/v1/deal-threads/${created.body.id}/messages`)
      .set("Authorization", `Bearer ${unrelated.token}`)
      .send({ body: "Can I join?" })
      .expect(404);
  });

  it("rejects client-supplied listing identity fields", async () => {
    const http = request(app.getHttpServer());
    const renter = await signIn(app, "renter@example.com");
    await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${renter.token}`)
      .send({ listingId: "listing-1", listingTitle: "Forged title", contactName: "Forged host" })
      .expect(400);
  });
});

async function signIn(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const code = await http.post("/api/v1/auth/email-code").send({ email }).expect(201);
  const session = await http
    .post("/api/v1/auth/verify-email")
    .send({ email, code: code.body.devCode })
    .expect(201);
  return { token: session.body.accessToken as string, user: session.body.user };
}

async function signInAsAdmin(app: INestApplication, email: string) {
  const session = await signIn(app, email);
  const jwt = app.get(JwtService);
  const adminId = session.user.id as string;
  const adminEmail = session.user.email as string;
  const adminToken = await jwt.signAsync({
    sub: adminId,
    email: adminEmail,
    role: "ADMIN",
    adminReauthenticatedAt: Math.floor(Date.now() / 1000)
  });
  return { ...session, token: adminToken };
}

async function completePublisherProfile(app: INestApplication, token: string) {
  await request(app.getHttpServer())
    .patch("/api/v1/profiles/me")
    .set("Authorization", `Bearer ${token}`)
    .send({
      displayName: "Listing Host",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    })
    .expect(200);
}

async function createApprovedListing(http: any, host: any, admin: any) {
  const created = await http
    .post("/api/v1/listings")
    .set("Authorization", `Bearer ${host.token}`)
    .send({
      title: "Service-backed Westwood room",
      area: "LA · Westwood",
      availableFrom: "2026-08-20",
      availableTo: "2026-12-31",
      price: 1750,
      originalPrice: 1900,
      beds: 2,
      baths: 1,
      commute: "12 minutes to UCLA",
      transit: "Bus nearby",
      trust: "Verified",
      tags: ["Furnished"]
    })
    .expect(201);
  await http
    .post(`/api/v1/listings/${created.body.id}/submit`)
    .set("Authorization", `Bearer ${host.token}`)
    .expect(201);
  return (
    await http
      .post(`/api/v1/admin/listings/${created.body.id}/approve`)
      .set("Authorization", `Bearer ${admin.token}`)
      .expect(201)
  ).body;
}
