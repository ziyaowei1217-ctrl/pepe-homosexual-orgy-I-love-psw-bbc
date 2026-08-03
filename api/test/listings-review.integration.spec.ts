import { BadRequestException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuditService, type AuditActor } from "../src/audit/audit.service";
import { ListingsService } from "../src/listings/listings.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres("listing_review_concurrency");

describeDatabase("listing review PostgreSQL concurrency", () => {
  let firstClient: PrismaClient | undefined;
  let secondClient: PrismaClient | undefined;
  let firstService: ListingsService;
  let secondService: ListingsService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    firstClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    secondClient = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([firstClient.$connect(), secondClient.$connect()]);
    firstService = new ListingsService(firstClient as never, new AuditService());
    secondService = new ListingsService(secondClient as never, new AuditService());
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([firstClient?.$disconnect(), secondClient?.$disconnect()]);
    database.drop();
  });

  it("allows exactly one concurrent approve/reject decision and one success audit", async () => {
    if (!firstClient) throw new Error("test database was not initialized");
    const owner = await firstClient.user.create({ data: { email: "listing-owner@example.com" } });
    const listing = await firstClient.listing.create({
      data: {
        ownerId: owner.id,
        title: "Concurrent review listing",
        area: "Boston",
        price: 1_900,
        originalPrice: 2_100,
        beds: 1,
        baths: 1,
        commute: "10 minutes",
        transit: "Green Line",
        trust: "Verified",
        tags: ["review"],
        status: "SUBMITTED",
        submittedAt: new Date()
      }
    });
    const firstActor = actor("first-admin", "first-admin@example.com");
    const secondActor = actor("second-admin", "second-admin@example.com");

    const decisions = await Promise.allSettled([
      firstService.approve(listing.id, firstActor),
      secondService.reject(listing.id, secondActor, "Please add clearer bedroom photos")
    ]);

    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    const rejected = decisions.find((decision) => decision.status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected", reason: expect.any(BadRequestException) });
    const finalListing = await firstClient.listing.findUniqueOrThrow({ where: { id: listing.id } });
    const audits = await firstClient.auditEvent.findMany({
      where: { targetType: "Listing", targetId: listing.id }
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe(finalListing.status === "APPROVED" ? "LISTING_APPROVED" : "LISTING_REJECTED");
  });
});

function actor(actorUserId: string, actorEmail: string): AuditActor {
  return { actorType: "USER", actorUserId, actorEmail, requestId: `request-${actorUserId}` };
}
