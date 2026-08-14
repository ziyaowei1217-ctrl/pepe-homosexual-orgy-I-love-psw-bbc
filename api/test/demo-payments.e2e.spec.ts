import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApplicationsService } from "../src/applications/applications.service";
import { AuthGuard } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { DemoPaymentsController, DemoHeldFundsController } from "../src/demo-payments/demo-payments.controller";
import { DemoPaymentsService } from "../src/demo-payments/demo-payments.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { createMarketplaceDemoPrismaMock } from "./support/marketplace-demo-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("demo payment HTTP API", () => {
  let app: INestApplication;
  let tokens: Record<string, string>;
  let applicationId: string;

  beforeEach(async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "demo-payments-http-secret" })],
      controllers: [DemoPaymentsController, DemoHeldFundsController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        ApplicationsService,
        DemoPaymentsService,
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

    const applications = app.get(ApplicationsService);
    const draft = await applications.create("renter-1", "create-key-0001", {
      listingId: "listing-1",
      scope: "SOLO",
      moveIn: "2026-09-01",
      moveOut: "2026-12-31",
      schoolOrOccupation: "UCLA student",
      incomeBand: "TWO_TO_THREE_X",
      guarantorStatus: "AVAILABLE",
      note: "Quiet"
    });
    await applications.submit("renter-1", draft.id, "submit-key-0001");
    await applications.accept("owner-1", draft.id, "accept-key-0001");
    prisma.state.applications[0]!.moveIn = new Date("2026-08-01T00:00:00.000Z");
    applicationId = draft.id;
  });

  afterEach(async () => app.close());

  it("exposes deterministic attempts, held funds, and dual-confirmation release without payment credentials", async () => {
    const http = request(app.getHttpServer());
    await http.get(`/api/v1/demo-payments/by-application/${applicationId}`).expect(401);
    await http.get(`/api/v1/demo-payments/by-application/${applicationId}`).auth(tokens["stranger-1"], { type: "bearer" }).expect(404);
    await http.get(`/api/v1/demo-payments/by-application/${applicationId}`).auth(tokens["owner-1"], { type: "bearer" }).expect(200)
      .expect(({ body }: { body: Record<string, any> }) => {
        expect(body.disclaimer).toBe("演示模式，不会真实扣款");
        expect(body.payment.status).toBe("AWAITING_ATTEMPT");
      });

    await http
      .post(`/api/v1/demo-payments/by-application/${applicationId}/simulate-failure`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .expect(400);
    await http
      .post(`/api/v1/demo-payments/by-application/${applicationId}/simulate-success`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "success-key-card")
      .send({ cardNumber: "4111111111111111" })
      .expect(400);
    await http
      .post(`/api/v1/demo-payments/by-application/${applicationId}/simulate-failure`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "failure-key-0001")
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.payment.status).toBe("AWAITING_ATTEMPT"));
    const held = await http
      .post(`/api/v1/demo-payments/by-application/${applicationId}/simulate-success`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "success-key-0001")
      .send({})
      .expect(201);
    expect(held.body).toMatchObject({ disclaimer: "演示模式，不会真实扣款", payment: { status: "HELD" }, heldFund: { status: "HELD" } });

    await http
      .post(`/api/v1/demo-held-funds/${held.body.heldFund.id}/confirm-move-in`)
      .auth(tokens["renter-1"], { type: "bearer" })
      .set("Idempotency-Key", "confirm-key-renter")
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.heldFund.status).toBe("HELD"));
    await http
      .post(`/api/v1/demo-held-funds/${held.body.heldFund.id}/confirm-move-in`)
      .auth(tokens["owner-1"], { type: "bearer" })
      .set("Idempotency-Key", "confirm-key-owner")
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => {
        expect(body.payment.status).toBe("RELEASED");
        expect(body.heldFund.status).toBe("RELEASED");
        expect(body.application.status).toBe("COMPLETED");
      });
  });
});
