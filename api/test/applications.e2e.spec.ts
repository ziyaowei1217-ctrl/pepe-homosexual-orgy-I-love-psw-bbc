import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationsController } from "../src/applications/applications.controller";
import { ApplicationsService } from "../src/applications/applications.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { DemoPaymentsService } from "../src/demo-payments/demo-payments.service";
import { PAYMENT_COMMANDS } from "../src/payments/payment-commands";
import { PrismaService } from "../src/prisma/prisma.service";
import { createMarketplaceDemoPrismaMock } from "./support/marketplace-demo-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("rental application HTTP API", () => {
  let app: INestApplication;
  let tokens: Record<string, string>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
    const prisma = createMarketplaceDemoPrismaMock();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "applications-http-secret" })],
      controllers: [ApplicationsController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        ApplicationsService,
        DemoPaymentsService,
        { provide: PAYMENT_COMMANDS, useExisting: DemoPaymentsService },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const jwt = app.get(JwtService);
    tokens = Object.fromEntries(
      await Promise.all(["owner-1", "renter-1", "stranger-1"].map(async (id) => [id, await jwt.signAsync({ sub: id })]))
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await app.close();
  });

  it("stores entered contact details and exposes them after an authorized reload", async () => {
    const http = request(app.getHttpServer());
    const created = await http.post("/api/v1/applications")
      .auth(tokens["renter-1"], { type: "bearer" }).set("Idempotency-Key", "create-contact-request")
      .send({ ...applicationPayload(), contactName: "  Entered Contact  ", contactEmail: "  entered@example.com  " }).expect(201);
    expect(created.body).toMatchObject({ contactName: "Entered Contact", contactEmail: "entered@example.com" });
    const reloaded = await http.get(`/api/v1/applications/${created.body.id}`)
      .auth(tokens["owner-1"], { type: "bearer" }).expect(200);
    expect(reloaded.body).toMatchObject({ contactName: "Entered Contact", contactEmail: "entered@example.com" });
  });

  it.each([
    { contactName: " " }, { contactName: "x".repeat(141) }, { contactName: 123 },
    { contactEmail: "not-an-email" }, { contactEmail: "" }, { contactEmail: "x".repeat(245) + "@example.com" }, { contactEmail: 123 }
  ])("rejects malformed contact information %j", async contact => {
    await request(app.getHttpServer()).post("/api/v1/applications")
      .auth(tokens["renter-1"], { type: "bearer" }).set("Idempotency-Key", "create-invalid-contact")
      .send({ ...applicationPayload(), ...contact }).expect(400);
  });

  it("persists renter create/submit state and exposes owner inbox decisions after refresh", async () => {
    const http = request(app.getHttpServer());
    const payload = applicationPayload();

    await http.post("/api/v1/applications").send(payload).expect(401);
    await http.post("/api/v1/applications").auth(tokens["renter-1"], { type: "bearer" }).send(payload).expect(400);
    await http
      .post("/api/v1/applications")
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "create-key-extra")
      .send({ ...payload, bankAccount: "forbidden" })
      .expect(400);

    const created = await http
      .post("/api/v1/applications")
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "create-key-0001")
      .send(payload)
      .expect(201);
    expect(created.body).toMatchObject({ status: "DRAFT", scope: "SOLO", note: "Quiet and tidy." });

    await http.get("/api/v1/applications/mine").auth(tokens["renter-1"], { type: "bearer" }).expect(200)
      .expect(({ body }: { body: unknown[] }) => expect(body).toHaveLength(1));
    await http.post(`/api/v1/applications/${created.body.id}/submit`).auth(tokens["renter-1"], { type: "bearer" }).expect(400);
    await http
      .post(`/api/v1/applications/${created.body.id}/submit`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "submit-key-0001")
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body.status).toBe("SUBMITTED"));

    await http.get("/api/v1/applications/host-inbox").auth(tokens["owner-1"], { type: "bearer" }).expect(200)
      .expect(({ body }: { body: Array<Record<string, unknown>> }) => expect(body[0]?.status).toBe("SUBMITTED"));
    await http
      .post(`/api/v1/applications/${created.body.id}/accept`)
      .auth(tokens["stranger-1"], { type: "bearer" })
      .set("Idempotency-Key", "accept-key-bad")
      .send({})
      .expect(404);
    await http
      .post(`/api/v1/applications/${created.body.id}/accept`)
      .auth(tokens["owner-1"], { type: "bearer" })
      .set("Idempotency-Key", "accept-key-0001")
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body.status).toBe("ACCEPTED"));

    await http.get(`/api/v1/applications/${created.body.id}`).auth(tokens["renter-1"], { type: "bearer" }).expect(200)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body.status).toBe("ACCEPTED"));
    await http
      .post(`/api/v1/applications/${created.body.id}/cancel`)
      .auth(tokens["owner-1"], { type: "bearer" })
      .set("Idempotency-Key", "cancel-key-0001")
      .send({ reason: "房源计划调整" })
      .expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body.status).toBe("CANCELLED"));
  });
});

function applicationPayload() {
  return {
    listingId: "listing-1",
    scope: "SOLO",
    moveIn: "2026-09-01",
    moveOut: "2026-12-31",
    schoolOrOccupation: " UCLA student ",
    incomeBand: "TWO_TO_THREE_X",
    guarantorStatus: "AVAILABLE",
    note: " Quiet and tidy. "
  };
}
