import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("deal thread HTTP API", () => {
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

  it("persists the authenticated DM and viewing workflow", async () => {
    const http = request(app.getHttpServer());

    await http.get("/api/v1/deal-threads").set("Authorization", `Bearer ${token}`).expect(200).expect([]);

    const createdResponse = await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...threadPayload(),
        listingTitle: "  Santa Monica shared 2B2B  ",
        participantNames: ["Mia Chen", " You ", "Mia Chen"]
      })
      .expect(201);

    expect(createdResponse.body).toMatchObject({
      listingId: "listing-1",
      listingTitle: "Santa Monica shared 2B2B",
      area: "LA - Santa Monica",
      contactName: "Taylor",
      participantNames: ["Mia Chen", "You"],
      messages: [],
      viewingRequests: []
    });

    const messageResponse = await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "  Can we tour after class on Friday?  " })
      .expect(201);

    expect(messageResponse.body.messages).toHaveLength(1);
    expect(messageResponse.body.messages[0]).toMatchObject({
      senderName: "You",
      body: "Can we tour after class on Friday?",
      align: "right",
      status: "sent"
    });

    const viewingResponse = await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/viewing-requests`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        iso: "2026-08-21T12:00:00.000Z",
        mode: "in-person",
        participantNames: ["Mia Chen", "You", "Mia Chen"],
        timeLabel: " Aug 21 Fri 12:00 "
      })
      .expect(201);

    expect(viewingResponse.body.viewingRequests).toHaveLength(1);
    expect(viewingResponse.body.viewingRequests[0]).toMatchObject({
      listingId: "listing-1",
      listingTitle: "Santa Monica shared 2B2B",
      mode: "in-person",
      participantNames: ["Mia Chen", "You"],
      status: "REQUESTED",
      timeLabel: "Aug 21 Fri 12:00"
    });
    expect(viewingResponse.body.messages).toHaveLength(2);
    expect(viewingResponse.body.messages[1].body).toContain("Aug 21 Fri 12:00");

    const adjustedViewingResponse = await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/viewing-requests`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        iso: "2026-08-22T11:00:00.000Z",
        mode: "video",
        participantNames: ["Mia Chen", "You"],
        timeLabel: "Aug 22 Sat 11:00"
      })
      .expect(201);

    expect(adjustedViewingResponse.body.viewingRequests).toHaveLength(1);
    expect(adjustedViewingResponse.body.viewingRequests[0]).toMatchObject({
      mode: "video",
      timeLabel: "Aug 22 Sat 11:00"
    });
    expect(adjustedViewingResponse.body.messages.at(-1).body).toContain("调整看房到 Aug 22 Sat 11:00");

    await http
      .get("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({
          id: createdResponse.body.id,
          listingId: "listing-1"
        });
      });
  });

  it("validates payloads and hides threads from other users", async () => {
    const http = request(app.getHttpServer());
    const createdResponse = await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${token}`)
      .send(threadPayload())
      .expect(201);

    await http.post(`/api/v1/deal-threads/${createdResponse.body.id}/messages`).send({ body: "hello" }).expect(401);

    await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...threadPayload(),
        participantNames: ["   "]
      })
      .expect(400);

    await http
      .post("/api/v1/deal-threads")
      .set("Authorization", `Bearer ${token}`)
      .send({
        ...threadPayload(),
        dealRoomId: "deal-room-other"
      })
      .expect(404);

    await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/viewing-requests`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        iso: "2026-08-21T12:00:00.000Z",
        mode: "in-person",
        participantNames: [],
        timeLabel: "Aug 21 Fri 12:00"
      })
      .expect(400);

    await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/viewing-requests`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        iso: "not-a-date",
        mode: "phone",
        participantNames: ["Mia Chen"],
        timeLabel: "Aug 21 Fri 12:00",
        extra: true
      })
      .expect(400);

    const otherToken = await signIn(app, "other@example.com");
    await http
      .post(`/api/v1/deal-threads/${createdResponse.body.id}/messages`)
      .set("Authorization", `Bearer ${otherToken}`)
      .send({ body: "Can I join?" })
      .expect(404);
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

function threadPayload() {
  return {
    area: " LA - Santa Monica ",
    contactName: " Taylor ",
    listingId: " listing-1 ",
    listingTitle: "Santa Monica shared 2B2B",
    participantNames: ["Mia Chen", "You"]
  };
}
