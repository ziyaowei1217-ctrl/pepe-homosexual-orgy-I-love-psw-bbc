import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDisposablePostgres } from "./support/disposable-postgres";

const runDatabaseTests = process.env.RUN_DB_SMOKE === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const database = createDisposablePostgres(`rental_applications_${randomUUID()}`);

describe("rental application Prisma contract", () => {
  it("exposes the exact state enums and required persistence fields", () => {
    const enums = new Map(
      Prisma.dmmf.datamodel.enums.map((entry) => [entry.name, entry.values.map((value) => value.name)])
    );
    const model = Prisma.dmmf.datamodel.models.find((entry) => entry.name === "RentalApplication");

    expect(enums.get("RentalApplicationStatus")).toEqual([
      "DRAFT",
      "SUBMITTED",
      "ACCEPTED",
      "REJECTED",
      "WITHDRAWN",
      "CANCELLED",
      "COMPLETED",
      "CANCELLATION_PENDING"
    ]);
    expect(enums.get("RentalApplicationScope")).toEqual(["SOLO", "TEAM"]);
    expect(enums.get("RentalIncomeBand")).toEqual([
      "BELOW_2X",
      "TWO_TO_THREE_X",
      "THREE_TO_FOUR_X",
      "ABOVE_FOUR_X",
      "PREFER_NOT_TO_SAY"
    ]);
    expect(enums.get("GuarantorStatus")).toEqual(["AVAILABLE", "NOT_AVAILABLE", "NOT_NEEDED"]);
    expect(model?.fields.map((field) => field.name)).toEqual(expect.arrayContaining([
      "listingId",
      "listingOwnerId",
      "submitterId",
      "teamId",
      "activeKey",
      "acceptedListingKey",
      "memberSnapshots",
      "moveIn",
      "moveOut",
      "createKey",
      "submitKey",
      "withdrawKey",
      "decisionKey",
      "cancelKey"
    ]));
  });
});

describeDatabase("rental application PostgreSQL constraints", () => {
  beforeAll(() => {
    database.create();
    database.migrateDeploy();
    execute(`
      INSERT INTO "User" ("id", "email", "updatedAt") VALUES
        ('owner-1', 'owner@example.com', NOW()),
        ('renter-1', 'renter@example.com', NOW()),
        ('renter-2', 'teammate@example.com', NOW());
      INSERT INTO "Listing" (
        "id", "ownerId", "title", "area", "availableFrom", "availableTo",
        "price", "originalPrice", "beds", "baths", "commute", "transit", "trust", "tags", "status", "updatedAt"
      ) VALUES (
        'listing-1', 'owner-1', 'Test listing', 'Westwood', '2026-09-01', '2027-01-01',
        1850, 2000, 2, 1, '10 min', 'Bus', 'verified', ARRAY['furnished'], 'APPROVED', NOW()
      );
      INSERT INTO "RoommateTeam" ("id", "updatedAt") VALUES ('team-1', NOW());
    `);
  }, 30_000);

  afterAll(() => database.drop());

  it("persists exact status order and accepts a valid team application", () => {
    expect(query(`SELECT array_to_string(enum_range(NULL::"RentalApplicationStatus"), ',')`)).toBe(
      "DRAFT,SUBMITTED,ACCEPTED,REJECTED,WITHDRAWN,CANCELLED,COMPLETED,CANCELLATION_PENDING"
    );
    execute(insertApplication({ id: "application-valid", scope: "TEAM", teamId: "team-1" }));
    expect(query(`SELECT "status"::text FROM "RentalApplication" WHERE "id" = 'application-valid'`)).toBe("DRAFT");
  });

  it("rejects team scope without a team and non-increasing dates", () => {
    expect(() => execute(insertApplication({ id: "application-no-team", scope: "TEAM", teamId: null })))
      .toThrow(/RentalApplication_team_scope_check/);
    expect(() => execute(insertApplication({
      id: "application-bad-dates",
      scope: "SOLO",
      teamId: null,
      moveIn: "2026-09-02",
      moveOut: "2026-09-01"
    }))).toThrow(/RentalApplication_date_order_check/);
  });
});

function insertApplication(input: {
  id: string;
  scope: "SOLO" | "TEAM";
  teamId: string | null;
  moveIn?: string;
  moveOut?: string;
}) {
  return `
    INSERT INTO "RentalApplication" (
      "id", "listingId", "listingOwnerId", "submitterId", "teamId", "scope",
      "activeKey", "memberSnapshots", "moveIn", "moveOut", "schoolOrOccupation",
      "incomeBand", "guarantorStatus", "note", "createKey", "updatedAt"
    ) VALUES (
      '${input.id}', 'listing-1', 'owner-1', 'renter-1', ${input.teamId ? `'${input.teamId}'` : "NULL"}, '${input.scope}',
      '${input.scope.toLowerCase()}:listing-1:${input.teamId ?? "renter-1"}', '[]'::jsonb,
      '${input.moveIn ?? "2026-09-01"}', '${input.moveOut ?? "2026-12-31"}', 'Student',
      'TWO_TO_THREE_X', 'AVAILABLE', '', 'create-key-${input.id}', NOW()
    );
  `;
}

function execute(sql: string) {
  runPsql(["-d", database.databaseName], sql);
}

function query(sql: string) {
  return runPsql(["-d", database.databaseName, "-tAc", sql]);
}

function runPsql(args: string[], input?: string) {
  const result = spawnSync(
    "docker",
    ["exec", "-i", "sublet-pipeline-db", "psql", "-v", "ON_ERROR_STOP=1", "-U", "sublet", ...args],
    { encoding: "utf8", input, timeout: 10_000 }
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}
