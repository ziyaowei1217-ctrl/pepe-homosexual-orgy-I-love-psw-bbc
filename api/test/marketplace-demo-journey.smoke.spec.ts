import "reflect-metadata";

import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test, type TestingModule } from "@nestjs/testing";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  LISTING_MEDIA_STORAGE,
  type ListingMediaStorage
} from "../src/listing-media/listing-media-storage";
import { PrismaService } from "../src/prisma/prisma.service";
import { createDisposablePostgres } from "./support/disposable-postgres";
import { closeOwnedNestLifecycle } from "./support/owned-nest-lifecycle";

const request = require("supertest") as (server: unknown) => any;

const runSmoke = process.env.RUN_DB_SMOKE === "1" && process.env.RUN_MARKETPLACE_SMOKE === "1";
const runChild = process.env.RUN_MARKETPLACE_SMOKE_CHILD === "1";
const describeSmoke = runSmoke ? describe : describe.skip;
const CHILD_TIMEOUT_MS = 45_000;

// Keep real time for S3 request signatures; the rental starts on today's LA date.
const journeyMoveIn = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());
const journeyMoveOut = new Date(new Date(`${journeyMoveIn}T00:00:00Z`).getTime() + 30 * 86_400_000).toISOString().slice(0, 10);


function defineMarketplaceJourney() {
  const originalEnvironment = {
    jwtSecret: process.env.JWT_SECRET,
    nodeEnv: process.env.NODE_ENV,
    valkeyUrl: process.env.VALKEY_URL
  };

  let app: INestApplication | undefined;
  let moduleRef: TestingModule | undefined;
  let prisma: PrismaService;
  let storage: ListingMediaStorage;
  let jwt: JwtService;
  let imageBytes: Buffer;
  let imageChecksum = "";

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const actors = {
    owner: { id: `market-owner-${runId}`, email: `market-owner-${runId}@example.test`, role: "USER" as const },
    renter: { id: `market-renter-${runId}`, email: `market-renter-${runId}@example.test`, role: "USER" as const },
    teammate: { id: `market-teammate-${runId}`, email: `market-teammate-${runId}@example.test`, role: "USER" as const },
    admin: { id: `market-admin-${runId}`, email: `market-admin-${runId}@example.test`, role: "ADMIN" as const }
  };
  const profileIds = {
    renter: `market-profile-renter-${runId}`,
    teammate: `market-profile-teammate-${runId}`
  };
  const tokens: Record<keyof typeof actors, string> = { owner: "", renter: "", teammate: "", admin: "" };

  beforeAll(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "marketplace-demo-smoke-secret";
    delete process.env.VALKEY_URL;

    const { AppModule } = await import("../src/app.module");
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ forceCloseConnections: true });
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    storage = app.get<ListingMediaStorage>(LISTING_MEDIA_STORAGE);
    jwt = app.get(JwtService);
    imageBytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 20, g: 120, b: 220 } }
    }).png().toBuffer();
    imageChecksum = createHash("sha256").update(imageBytes).digest("hex");

    await prisma.user.createMany({ data: Object.values(actors) });
    await prisma.profile.createMany({
      data: [
        { email: actors.owner.email, displayName: "Smoke Host", school: "UCLA", city: "Los Angeles", role: "lister" },
        { email: actors.renter.email, displayName: "Smoke Renter", school: "UCLA", city: "Los Angeles", role: "renter" },
        { email: actors.teammate.email, displayName: "Smoke Teammate", school: "USC", city: "Los Angeles", role: "renter" },
        { email: actors.admin.email, displayName: "Smoke Admin", city: "Los Angeles", role: "lister" }
      ]
    });
    await prisma.roommateProfile.createMany({
      data: [
        roommateProfile(profileIds.renter, actors.renter.id, "Smoke Renter"),
        roommateProfile(profileIds.teammate, actors.teammate.id, "Smoke Teammate")
      ]
    });

    for (const [key, actor] of Object.entries(actors) as Array<[keyof typeof actors, (typeof actors)[keyof typeof actors]]>) {
      tokens[key] = await jwt.signAsync({
        sub: actor.id,
        email: actor.email,
        role: actor.role,
        ...(key === "admin" ? { adminReauthenticatedAt: Math.floor(Date.now() / 1000) } : {})
      });
    }
  }, 30_000);

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    try {
      if (prisma && storage) {
        const media = await prisma.listingMedia.findMany({
          where: { listing: { ownerId: actors.owner.id } },
          select: { originalKey: true }
        });
        for (const item of media) {
          if (!item.originalKey) continue;
          try {
            await storage.delete(item.originalKey);
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
      }
      try {
        await closeOwnedNestLifecycle({ application: app, module: moduleRef });
      } catch (error) {
        cleanupErrors.push(error);
      }
    } finally {
      restoreEnvironment("JWT_SECRET", originalEnvironment.jwtSecret);
      restoreEnvironment("NODE_ENV", originalEnvironment.nodeEnv);
      restoreEnvironment("VALKEY_URL", originalEnvironment.valkeyUrl);
    }
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "Marketplace smoke cleanup failed");
  }, 30_000);

  it("runs listing media, team applications, held funds, immutable ledger, confirmations, and team dissolution", async () => {
    const http = request(app!.getHttpServer());
    const primaryListing = await createApprovedListing(http, "Primary");
    const dissolutionListing = await createApprovedListing(http, "Dissolution");

    const publicResults = await http
      .get(`/api/v1/listings?moveIn=${journeyMoveIn}&moveOut=${journeyMoveOut}`)
      .expect(200);
    expect(publicResults.body.map((listing: { id: string }) => listing.id)).toEqual(
      expect.arrayContaining([primaryListing.id, dissolutionListing.id])
    );

    await http
      .post(`/api/v1/roommates/${profileIds.teammate}/actions`)
      .auth(tokens.renter, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201);
    await http
      .post(`/api/v1/roommates/${profileIds.renter}/actions`)
      .auth(tokens.teammate, { type: "bearer" })
      .send({ action: "LIKE" })
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.conversation.id).toBeTruthy());

    const invite = await http
      .post("/api/v1/roommate-teams/invites")
      .auth(tokens.renter, { type: "bearer" })
      .send({ roommateProfileId: profileIds.teammate })
      .expect(201);
    const team = await http
      .post(`/api/v1/roommate-teams/invites/${invite.body.id}/accept`)
      .auth(tokens.teammate, { type: "bearer" })
      .send({})
      .expect(201);
    expect(team.body.members).toHaveLength(2);

    const acceptedApplication = await createAndSubmitTeamApplication(http, primaryListing.id, team.body.id, "accepted");
    const submittedForDissolution = await createAndSubmitTeamApplication(http, dissolutionListing.id, team.body.id, "dissolve");

    const hostInbox = await http
      .get("/api/v1/applications/host-inbox")
      .auth(tokens.owner, { type: "bearer" })
      .expect(200);
    expect(hostInbox.body.map((application: { id: string }) => application.id)).toEqual(
      expect.arrayContaining([acceptedApplication.id, submittedForDissolution.id])
    );

    await http
      .post(`/api/v1/applications/${acceptedApplication.id}/accept`)
      .auth(tokens.owner, { type: "bearer" })
      .set("Idempotency-Key", `accept-${runId}`)
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.status).toBe("ACCEPTED"));

    await http
      .post(`/api/v1/demo-payments/by-application/${acceptedApplication.id}/simulate-failure`)
      .auth(tokens.renter, { type: "bearer" })
      .set("Idempotency-Key", `failure-${runId}`)
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.attempts.at(-1).outcome).toBe("FAILED"));

    const held = await http
      .post(`/api/v1/demo-payments/by-application/${acceptedApplication.id}/simulate-success`)
      .auth(tokens.renter, { type: "bearer" })
      .set("Idempotency-Key", `success-${runId}`)
      .send({})
      .expect(201);
    expect(held.body).toMatchObject({
      disclaimer: "演示模式，不会真实扣款",
      payment: { amountCents: 185000, status: "HELD" },
      heldFund: { status: "HELD" }
    });

    await http
      .post(`/api/v1/demo-held-funds/${held.body.heldFund.id}/confirm-move-in`)
      .auth(tokens.renter, { type: "bearer" })
      .set("Idempotency-Key", `confirm-renter-${runId}`)
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.heldFund.status).toBe("HELD"));
    await http
      .post(`/api/v1/demo-held-funds/${held.body.heldFund.id}/confirm-move-in`)
      .auth(tokens.owner, { type: "bearer" })
      .set("Idempotency-Key", `confirm-owner-${runId}`)
      .send({})
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => {
        expect(body.payment.status).toBe("RELEASED");
        expect(body.heldFund.status).toBe("RELEASED");
        expect(body.application.status).toBe("COMPLETED");
      });

    const ledger = await prisma.demoLedgerEntry.findMany({
      where: { paymentId: held.body.payment.id },
      orderBy: [{ transactionId: "asc" }, { direction: "asc" }]
    });
    expect(ledger).toHaveLength(4);
    expect(new Set(ledger.map((entry) => entry.event))).toEqual(new Set(["HOLD", "RELEASE"]));
    for (const transactionId of new Set(ledger.map((entry) => entry.transactionId))) {
      const entries = ledger.filter((entry) => entry.transactionId === transactionId);
      expect(entries).toHaveLength(2);
      expect(entries.reduce((balance, entry) => balance + (entry.direction === "DEBIT" ? entry.amountCents : -entry.amountCents), 0)).toBe(0);
    }
    await expect(
      prisma.demoLedgerEntry.update({ where: { id: ledger[0]!.id }, data: { amountCents: 1 } })
    ).rejects.toThrow(/DemoLedgerEntry is immutable/);

    await http
      .post("/api/v1/roommate-teams/current/leave")
      .auth(tokens.renter, { type: "bearer" })
      .send({ teamId: team.body.id })
      .expect(201)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.status).toBe("DISSOLVED"));
    await http
      .get(`/api/v1/applications/${submittedForDissolution.id}`)
      .auth(tokens.teammate, { type: "bearer" })
      .expect(200)
      .expect(({ body }: { body: Record<string, any> }) => {
        expect(body.status).toBe("WITHDRAWN");
        expect(body.decisionReason).toBe("TEAM_DISSOLVED");
      });
    await http
      .get(`/api/v1/applications/${acceptedApplication.id}`)
      .auth(tokens.renter, { type: "bearer" })
      .expect(200)
      .expect(({ body }: { body: Record<string, any> }) => expect(body.status).toBe("COMPLETED"));

    async function createApprovedListing(httpClient: any, suffix: string) {
      const listing = await httpClient
        .post("/api/v1/listings")
        .auth(tokens.owner, { type: "bearer" })
        .send(listingPayload(`Marketplace smoke ${suffix}`))
        .expect(201);
      const upload = await httpClient
        .post(`/api/v1/listings/${listing.body.id}/media/uploads`)
        .auth(tokens.owner, { type: "bearer" })
        .send({
          commandId: randomUUID(), kind: "室内", mimeType: "image/png", sizeBytes: imageBytes.length, checksumSha256: imageChecksum })
        .expect(201);
      expect(upload.body.media).not.toHaveProperty("originalKey");
      const uploadBody = imageBytes.buffer.slice(
        imageBytes.byteOffset,
        imageBytes.byteOffset + imageBytes.byteLength
      ) as ArrayBuffer;
      const uploaded = await fetch(upload.body.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: uploadBody
      });
      expect(uploaded.status).toBe(200);
      const finalized = await httpClient
        .post(`/api/v1/listings/${listing.body.id}/media/${upload.body.media.id}/finalize`)
        .auth(tokens.owner, { type: "bearer" })
        .send({ uploadAttemptId: upload.body.uploadAttemptId })
        .expect(201);
      expect(finalized.body.storageStatus).toBe("READY");
      const submitted = await httpClient
        .post(`/api/v1/listings/${listing.body.id}/submit`)
        .auth(tokens.owner, { type: "bearer" })
        .send({})
        .expect(201);
      await httpClient
        .post(`/api/v1/admin/listings/${listing.body.id}/approve`)
        .auth(tokens.admin, { type: "bearer" })
        .send({ revision: submitted.body.revision })
        .expect(201);
      const publishedContent = await httpClient
        .get(`/api/v1/listing-media/${upload.body.media.id}/content`)
        .expect(200)
        .expect("Content-Type", /image\/png/);
      expect(Buffer.from(publishedContent.body)).toEqual(imageBytes);
      return listing.body as { id: string };
    }

    async function createAndSubmitTeamApplication(httpClient: any, listingId: string, teamId: string, suffix: string) {
      const created = await httpClient
        .post("/api/v1/applications")
        .auth(tokens.renter, { type: "bearer" })
        .set("Idempotency-Key", `create-${suffix}-${runId}`)
        .send({
          listingId,
          scope: "TEAM",
          teamId,
          moveIn: journeyMoveIn,
          moveOut: journeyMoveOut,
          schoolOrOccupation: "UCLA student",
          incomeBand: "TWO_TO_THREE_X",
          guarantorStatus: "AVAILABLE",
          note: "External PostgreSQL and MinIO smoke"
        })
        .expect(201);
      return (await httpClient
        .post(`/api/v1/applications/${created.body.id}/submit`)
        .auth(tokens.renter, { type: "bearer" })
        .set("Idempotency-Key", `submit-${suffix}-${runId}`)
        .send({})
        .expect(201)).body as { id: string };
    }
  }, 30_000);
}

if (runChild) {
  describeSmoke("marketplace demo journey child against external PostgreSQL and MinIO", defineMarketplaceJourney);
} else {
  describeSmoke("marketplace demo journey against external PostgreSQL and MinIO", () => {
    const database = createDisposablePostgres("marketplace_demo");

    it("runs the isolated journey and drops its database", () => {
      let journeyError: unknown;
      try {
        database.create();
        database.migrateDeploy();
        runMarketplaceChild(database.databaseUrl);
      } catch (error) {
        journeyError = error;
      }
      try {
        database.drop();
      } catch (dropError) {
        if (journeyError) throw new AggregateError([journeyError, dropError], "Marketplace journey and database cleanup failed");
        throw dropError;
      }
      if (journeyError) throw journeyError;
    }, CHILD_TIMEOUT_MS + 45_000);
  });
}

function runMarketplaceChild(databaseUrl: string) {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("vitest/vitest.mjs"),
      "run",
      "test/marketplace-demo-journey.smoke.spec.ts",
      "--pool=threads",
      "--poolOptions.threads.singleThread"
    ],
    {
      cwd: join(__dirname, ".."),
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        RUN_DB_SMOKE: "1",
        RUN_MARKETPLACE_SMOKE: "1",
        RUN_MARKETPLACE_SMOKE_CHILD: "1"
      },
      timeout: CHILD_TIMEOUT_MS,
      killSignal: "SIGKILL"
    }
  );
  if (result.status !== 0) {
    throw new Error(`marketplace smoke child failed: ${result.error?.message || result.stderr || result.stdout}`);
  }
}

function listingPayload(title: string) {
  return {
    title,
    area: "Los Angeles · Westwood",
    availableFrom: journeyMoveIn,
    availableTo: journeyMoveOut,
    price: 1850,
    originalPrice: 2050,
    beds: 2,
    baths: 1,
    commute: "8 minute walk to UCLA",
    transit: "14 minutes by bus",
    trust: "Smoke test host declaration",
    tags: ["smoke", "verified"],
    score: 4.9
  };
}

function roommateProfile(id: string, ownerId: string, name: string) {
  return {
    id,
    ownerId,
    name,
    age: 24,
    role: "Marketplace smoke tester",
    image: `https://example.test/${id}.png`,
    match: 95,
    budget: "$1,850/month",
    commute: "Westwood",
    tags: ["verified", "quiet"]
  };
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
