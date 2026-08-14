import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres(`demo_payments_${randomUUID()}`);

describe("demo payment Prisma contract", () => {
  it("exposes payment, held-fund, and double-entry ledger models", () => {
    const enums = new Map(
      Prisma.dmmf.datamodel.enums.map((entry) => [entry.name, entry.values.map((value) => value.name)])
    );
    const models = new Set(Prisma.dmmf.datamodel.models.map((entry) => entry.name));

    expect(enums.get("DemoPaymentStatus")).toEqual(["AWAITING_ATTEMPT", "HELD", "REFUNDED", "RELEASED", "CLOSED"]);
    expect(enums.get("DemoPaymentAttemptOutcome")).toEqual(["SUCCEEDED", "FAILED"]);
    expect(enums.get("DemoHeldFundStatus")).toEqual(["HELD", "REFUNDED", "RELEASED"]);
    expect(enums.get("DemoLedgerEvent")).toEqual(["HOLD", "REFUND", "RELEASE"]);
    expect(enums.get("DemoLedgerAccount")).toEqual(["RENTER_CLEARING", "HELD_FUNDS", "HOST_CLEARING"]);
    expect(enums.get("DemoLedgerDirection")).toEqual(["DEBIT", "CREDIT"]);
    expect([...models]).toEqual(expect.arrayContaining(["DemoPayment", "DemoPaymentAttempt", "DemoHeldFund", "DemoLedgerEntry"]));
  });
});

describeDatabase("demo payment PostgreSQL constraints", () => {
  beforeAll(() => {
    database.create();
    database.migrateDeploy();
    execute(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES
        ('owner-1', 'owner@example.com', NOW()),
        ('renter-1', 'renter@example.com', NOW());
      INSERT INTO "Listing" (
        "id", "ownerId", "title", "area", "availableFrom", "availableTo", "price", "originalPrice",
        "beds", "baths", "commute", "transit", "trust", "tags", "status", "updatedAt"
      ) VALUES (
        'listing-1', 'owner-1', 'Test listing', 'Westwood', '2026-09-01', '2027-01-01', 1850, 2000,
        2, 1, '10 min', 'Bus', 'verified', ARRAY['furnished'], 'APPROVED', NOW()
      );
      INSERT INTO "RentalApplication" (
        "id", "listingId", "listingOwnerId", "submitterId", "scope", "status", "activeKey",
        "acceptedListingKey", "memberSnapshots", "moveIn", "moveOut", "schoolOrOccupation",
        "incomeBand", "guarantorStatus", "note", "createKey", "updatedAt"
      ) VALUES (
        'application-1', 'listing-1', 'owner-1', 'renter-1', 'SOLO', 'ACCEPTED', 'solo:listing-1:renter-1',
        'listing-1', '[]'::jsonb, '2026-09-01', '2026-12-31', 'Student', 'TWO_TO_THREE_X',
        'AVAILABLE', '', 'create-key-0001', NOW()
      );
      INSERT INTO "DemoPayment" ("id", "applicationId", "payerId", "payeeId", "amountCents", "updatedAt")
      VALUES ('payment-1', 'application-1', 'renter-1', 'owner-1', 185000, NOW());
      INSERT INTO "DemoHeldFund" ("id", "paymentId", "amountCents", "updatedAt")
      VALUES ('fund-1', 'payment-1', 185000, NOW());
      INSERT INTO "DemoLedgerEntry" (
        "id", "transactionId", "paymentId", "heldFundId", "event", "account", "direction",
        "amountCents", "idempotencyKey"
      ) VALUES (
        'entry-1', 'transaction-1', 'payment-1', 'fund-1', 'HOLD', 'RENTER_CLEARING', 'DEBIT',
        185000, 'hold-key-0001'
      );
    `);
  }, 30_000);

  afterAll(() => database.drop());

  it("rejects non-positive amounts and duplicate application/fund ownership", () => {
    expect(() => execute(`
      INSERT INTO "DemoPayment" ("id", "applicationId", "payerId", "payeeId", "amountCents", "updatedAt")
      VALUES ('payment-bad', 'application-1', 'renter-1', 'owner-1', 0, NOW());
    `)).toThrow(/DemoPayment_positive_amount/);
    expect(() => execute(`
      INSERT INTO "DemoHeldFund" ("id", "paymentId", "amountCents", "updatedAt")
      VALUES ('fund-duplicate', 'payment-1', 185000, NOW());
    `)).toThrow(/DemoHeldFund_paymentId_key/);
  });

  it("prohibits ledger update, delete, and truncate", () => {
    expect(() => execute(`UPDATE "DemoLedgerEntry" SET "amountCents" = 1 WHERE "id" = 'entry-1'`))
      .toThrow(/DemoLedgerEntry is immutable/);
    expect(() => execute(`DELETE FROM "DemoLedgerEntry" WHERE "id" = 'entry-1'`))
      .toThrow(/DemoLedgerEntry is immutable/);
    expect(() => execute(`TRUNCATE TABLE "DemoLedgerEntry"`)).toThrow(/DemoLedgerEntry is immutable/);
  });
});

function execute(sql: string) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", "-d", database.databaseName],
    { encoding: "utf8", input: sql, timeout: 10_000 }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
