import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationsService } from "../src/applications/applications.service";
import { applicationBusinessDate } from "../src/applications/application-business-date";
import { requireIdempotencyKey } from "../src/applications/application-idempotency";
import { createMarketplaceDemoPrismaMock } from "./support/marketplace-demo-prisma-mock";

const soloInput = {
  listingId: "listing-1",
  scope: "SOLO" as const,
  moveIn: "2026-09-01",
  moveOut: "2027-01-01",
  schoolOrOccupation: "  UCLA student  ",
  incomeBand: "TWO_TO_THREE_X" as const,
  guarantorStatus: "AVAILABLE" as const,
  note: "  Quiet and tidy.  "
};

describe("application idempotency", () => {
  it("accepts 8-120 visible ASCII characters and rejects unsafe keys", () => {
    expect(requireIdempotencyKey("create-key-0001")).toBe("create-key-0001");
    expect(requireIdempotencyKey("x".repeat(120))).toHaveLength(120);
    for (const value of [undefined, "short", `has space`, `line\nbreak`, "x".repeat(121)]) {
      expect(() => requireIdempotencyKey(value)).toThrow(BadRequestException);
    }
  });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("ApplicationsService draft and submit workflow", () => {
  it("creates a normalized solo draft with an immutable display snapshot and supports an exact retry", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);

    const created = await service.create("renter-1", "create-key-0001", soloInput);
    const retried = await service.create("renter-1", "create-key-0001", soloInput);

    expect(created).toMatchObject({
      scope: "SOLO",
      status: "DRAFT",
      activeKey: "solo:listing-1:renter-1",
      schoolOrOccupation: "UCLA student",
      note: "Quiet and tidy."
    });
    expect(created.memberSnapshots).toEqual([{ userId: "renter-1", displayName: "Lin" }]);
    expect(retried.id).toBe(created.id);
    prisma.state.profiles.find((profile: { email: string }) => profile.email === "renter@example.com")!.displayName = "Later name";
    expect(created.memberSnapshots).toEqual([{ userId: "renter-1", displayName: "Lin" }]);
  });

  it("rejects own listings, invalid availability, changed-key retries, and duplicate active scope", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);

    await expect(service.create("owner-1", "create-key-owner", soloInput)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.create("renter-1", "create-key-range", { ...soloInput, moveIn: "2026-08-31" }))
      .rejects.toBeInstanceOf(BadRequestException);
    await service.create("renter-1", "create-key-0001", soloInput);
    await expect(service.create("renter-1", "create-key-0001", { ...soloInput, note: "Changed" }))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(service.create("renter-1", "create-key-0002", soloInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates a team draft only for an active member and snapshots both members in user order", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const teamInput = { ...soloInput, scope: "TEAM" as const, teamId: "team-1" };

    const created = await service.create("renter-1", "create-team-0001", teamInput);
    expect(created.activeKey).toBe("team:listing-1:team-1");
    expect(created.memberSnapshots).toEqual([
      { userId: "renter-1", displayName: "Lin" },
      { userId: "renter-2", displayName: "Mia" }
    ]);
    await expect(service.create("stranger-1", "create-team-bad", teamInput)).rejects.toBeInstanceOf(NotFoundException);
    prisma.state.teams[0]!.status = "DISSOLVED";
    await expect(service.create("renter-2", "create-team-old", teamInput)).rejects.toBeInstanceOf(ConflictException);
  });

  it("lists only applicant/team-visible records and the owner's inbox", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const solo = await service.create("renter-1", "create-key-0001", soloInput);
    prisma.state.applications.push({
      ...solo,
      id: "application-team",
      submitterId: "renter-2",
      teamId: "team-1",
      scope: "TEAM",
      activeKey: "team:listing-1:team-1",
      createKey: "create-key-team"
    });

    await expect(service.findOne("stranger-1", solo.id)).rejects.toBeInstanceOf(NotFoundException);
    const mine = await service.mine("renter-1");
    const hostInbox = await service.hostInbox("owner-1");
    expect(mine.map((record) => record.id).sort()).toEqual(["application-1", "application-team"]);
    expect(hostInbox.map((record) => record.id).sort()).toEqual(["application-1", "application-team"]);
    expect(mine.every((record) => record.listingTitle === "Westwood room")).toBe(true);
    expect(hostInbox.every((record) => record.listingTitle === "Westwood room")).toBe(true);
    expect((await service.findOne("renter-2", "application-team")).id).toBe("application-team");
  });

  it("submits on exact availability boundaries, returns same-key retries, and withdraws once", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const draft = await service.create("renter-1", "create-key-0001", soloInput);

    const submitted = await service.submit("renter-1", draft.id, "submit-key-0001");
    expect(submitted).toMatchObject({ status: "SUBMITTED", submitKey: "submit-key-0001" });
    expect((await service.submit("renter-1", draft.id, "submit-key-0001")).submittedAt).toEqual(submitted.submittedAt);

    const withdrawn = await service.withdraw("renter-1", draft.id, "withdraw-key-0001");
    expect(withdrawn).toMatchObject({ status: "WITHDRAWN", activeKey: null, withdrawKey: "withdraw-key-0001" });
    expect((await service.withdraw("renter-1", draft.id, "withdraw-key-0001")).withdrawnAt).toEqual(withdrawn.withdrawnAt);
  });

  it("ensures the shared renter-host message thread when an application is submitted", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const dealThreads = {
      calls: [] as Array<{ renterId: string; applicationId: string }>,
      async createOrFindApplicationThread(renterId: string, applicationId: string) {
        this.calls.push({ renterId, applicationId });
        return { id: "thread-1" };
      }
    };
    const service = new ApplicationsService(prisma as never, createPaymentsStub(), dealThreads as never);
    const draft = await service.create("renter-1", "create-key-0001", soloInput);

    await service.submit("renter-1", draft.id, "submit-key-thread");

    expect(dealThreads.calls).toEqual([{ renterId: "renter-1", applicationId: draft.id }]);
  });

  it("rechecks listing/team state and blocks submit while a listing is accepted or completed", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const draft = await service.create("renter-1", "create-key-0001", soloInput);

    prisma.state.listings[0]!.status = "SUBMITTED";
    await expect(service.submit("renter-1", draft.id, "submit-key-listing")).rejects.toBeInstanceOf(ConflictException);
    prisma.state.listings[0]!.status = "APPROVED";
    prisma.state.applications.push({
      ...draft,
      id: "accepted-application",
      submitterId: "renter-2",
      activeKey: "solo:listing-1:renter-2",
      acceptedListingKey: "listing-1",
      createKey: "accepted-create-key",
      status: "ACCEPTED"
    });
    await expect(service.submit("renter-1", draft.id, "submit-key-blocked")).rejects.toBeInstanceOf(ConflictException);
    prisma.state.applications.at(-1)!.status = "CANCELLATION_PENDING";
    await expect(service.submit("renter-1", draft.id, "submit-key-pending")).rejects.toBeInstanceOf(ConflictException);
    prisma.state.applications.at(-1)!.status = "COMPLETED";
    await expect(service.submit("renter-1", draft.id, "submit-key-completed")).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("ApplicationsService owner decisions and cancellation", () => {
  it("lets only the listing owner accept once and creates the payment order in the transaction", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const payments = createPaymentsStub();
    const service = new ApplicationsService(prisma as never, payments);
    const first = await service.create("renter-1", "create-key-0001", soloInput);
    const second = await service.create("renter-2", "create-key-0002", soloInput);
    await service.submit("renter-1", first.id, "submit-key-0001");
    await service.submit("renter-2", second.id, "submit-key-0002");

    await expect(service.accept("stranger-1", first.id, "accept-key-bad"))
      .rejects.toBeInstanceOf(NotFoundException);
    const accepted = await service.accept("owner-1", first.id, "accept-key-0001");
    expect(accepted).toMatchObject({ status: "ACCEPTED", acceptedListingKey: "listing-1", decisionById: "owner-1" });
    expect(payments.ensureOrderCalls).toEqual([{ applicationId: first.id }]);
    expect((await service.accept("owner-1", first.id, "accept-key-0001")).id).toBe(first.id);
    expect(payments.ensureOrderCalls).toHaveLength(1);
    await expect(service.accept("owner-1", second.id, "accept-key-0002"))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it("rejects submitted applications with a bounded reason and clears the active key", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await service.create("renter-1", "create-key-0001", soloInput);
    await service.submit("renter-1", draft.id, "submit-key-0001");

    const rejected = await service.reject("owner-1", draft.id, "reject-key-0001", { reason: "  资料不匹配  " });
    expect(rejected).toMatchObject({
      status: "REJECTED",
      activeKey: null,
      decisionById: "owner-1",
      decisionReason: "资料不匹配"
    });
    expect((await service.reject("owner-1", draft.id, "reject-key-0001", { reason: "资料不匹配" })).id).toBe(draft.id);
  });

  it("cancels before move-in, delegates refund atomically, and rejects strangers or released funds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
    const prisma = createMarketplaceDemoPrismaMock();
    const payments = createPaymentsStub();
    const service = new ApplicationsService(prisma as never, payments);
    const draft = await service.create("renter-1", "create-key-0001", soloInput);
    await service.submit("renter-1", draft.id, "submit-key-0001");
    await service.accept("owner-1", draft.id, "accept-key-0001");

    await expect(service.cancel("stranger-1", draft.id, "cancel-key-bad", { reason: "No access" }))
      .rejects.toBeInstanceOf(NotFoundException);
    const cancelled = await service.cancel("renter-1", draft.id, "cancel-key-0001", { reason: "  计划改变  " });
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      activeKey: null,
      acceptedListingKey: null,
      cancelledById: "renter-1",
      cancellationReason: "计划改变"
    });
    expect(payments.refundCalls).toEqual([{ applicationId: draft.id, actorId: "renter-1", key: "cancel-key-0001" }]);

    const releasedPrisma = createMarketplaceDemoPrismaMock();
    const releasedPayments = createPaymentsStub("RELEASED");
    const releasedService = new ApplicationsService(releasedPrisma as never, releasedPayments);
    const releasedDraft = await releasedService.create("renter-1", "create-key-0001", soloInput);
    await releasedService.submit("renter-1", releasedDraft.id, "submit-key-0001");
    await releasedService.accept("owner-1", releasedDraft.id, "accept-key-0001");
    await expect(releasedService.cancel("owner-1", releasedDraft.id, "cancel-key-release", { reason: "Cannot" }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(releasedPrisma.state.applications[0]!.status).toBe("ACCEPTED");
  });

  it("allows cancellation until the Los Angeles move-in day begins", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await service.create("renter-1", "create-before-midnight", soloInput);
    await service.submit("renter-1", draft.id, "submit-before-midnight");
    await service.accept("owner-1", draft.id, "accept-before-midnight");
    vi.setSystemTime(new Date("2026-09-01T06:59:59.999Z"));
    expect((await service.cancel("owner-1", draft.id, "cancel-before-midnight", { reason: "Plans changed" })).status).toBe("CANCELLED");
  });

  it("blocks accepted cancellation on or after the agreed move-in date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T07:00:00.000Z"));
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await service.create("renter-1", "create-key-0001", soloInput);
    await service.submit("renter-1", draft.id, "submit-key-0001");
    await service.accept("owner-1", draft.id, "accept-key-0001");

    await expect(service.cancel("owner-1", draft.id, "cancel-key-late", { reason: "Too late" }))
      .rejects.toBeInstanceOf(ConflictException);
  });
});

describe("application transaction retry bounds", () => {
  it.each(["submit", "accept", "reject"] as const)("bounds repeated %s serialization failures without changing application state", async command => {
    const prisma = createMarketplaceDemoPrismaMock();
    const original = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await original.create("renter-1", "bounded-create-key", soloInput);
    if (command !== "submit") await original.submit("renter-1", draft.id, "bounded-submit-key");
    let attempts = 0;
    const failing = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== "$transaction") return Reflect.get(target, property, receiver);
        return async () => {
          attempts += 1;
          throw new Prisma.PrismaClientKnownRequestError("Serializable conflict", { code: "P2034", clientVersion: "6" });
        };
      }
    });
    const service = new ApplicationsService(failing as never, createPaymentsStub());
    const result = command === "submit"
      ? service.submit("renter-1", draft.id, "bounded-command-key")
      : service[command]("owner-1", draft.id, "bounded-command-key", { reason: "Decision reason" });
    await expect(result).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(attempts).toBe(3);
    expect(await original.findOne("renter-1", draft.id)).toMatchObject({ status: command === "submit" ? "DRAFT" : "SUBMITTED" });
  });

  it("does not retry unrelated database failures", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const original = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await original.create("renter-1", "database-fault-create", soloInput);
    const failure = new Prisma.PrismaClientKnownRequestError("Database unavailable", { code: "P1001", clientVersion: "6" });
    let attempts = 0;
    const failing = new Proxy(prisma, {
      get(target, property, receiver) {
        if (property !== "$transaction") return Reflect.get(target, property, receiver);
        return async () => { attempts += 1; throw failure; };
      }
    });
    await expect(new ApplicationsService(failing as never).submit("renter-1", draft.id, "database-fault-submit")).rejects.toBe(failure);
    expect(attempts).toBe(1);
  });
});

function createPaymentsStub(refundResult: "NO_FUNDS" | "REFUNDED" | "RELEASED" = "REFUNDED") {
  const stub = {
    ensureOrderCalls: [] as Array<{ applicationId: string }>,
    refundCalls: [] as Array<{ applicationId: string; actorId: string; key: string }>,
    ensureOrderForAcceptedApplication: async (_transaction: unknown, applicationId: string) => {
      stub.ensureOrderCalls.push({ applicationId });
      return { id: "payment-1" };
    },
    refundForCancellation: async (_transaction: unknown, applicationId: string, actorId: string, key: string) => {
      stub.refundCalls.push({ applicationId, actorId, key });
      return refundResult;
    }
  };
  return stub;
}


describe("application current listing and business date validation", () => {
  it.each([
    { status: "SUBMITTED" },
    { ownerId: "renter-1" },
    { ownerId: "new-owner" },
    { availableFrom: new Date("2026-09-02T00:00:00Z") },
    { availableTo: new Date("2026-12-31T00:00:00Z") }
  ])("rejects acceptance after listing change %j without a payment order", async (change) => {
    const prisma = createMarketplaceDemoPrismaMock();
    const payments = createPaymentsStub();
    const service = new ApplicationsService(prisma as never, payments);
    const draft = await service.create("renter-1", "create-stale-listing", soloInput);
    await service.submit("renter-1", draft.id, "submit-stale-listing");
    Object.assign(prisma.state.listings[0]!, change);
    await expect(service.accept("owner-1", draft.id, "accept-stale-listing")).rejects.toThrow();
    expect(prisma.state.applications[0]!.status).toBe("SUBMITTED");
    expect(payments.ensureOrderCalls).toHaveLength(0);
  });

  it("rejects submission when the listing owner has changed", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const draft = await service.create("renter-1", "create-owner-change", soloInput);
    prisma.state.listings[0]!.ownerId = "renter-1";
    await expect(service.submit("renter-1", draft.id, "submit-owner-change")).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.state.applications[0]!.status).toBe("DRAFT");
  });

  it.each(["create", "submit", "accept"] as const)("rejects past move-in during %s at Los Angeles midnight", async (command) => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = command !== "create" ? await service.create("renter-1", "create-date-check", soloInput) : null;
    if (command === "accept") await service.submit("renter-1", draft!.id, "submit-date-check");
    vi.setSystemTime(new Date("2026-09-02T07:00:00.000Z"));
    const result = command === "create"
      ? service.create("renter-1", "create-date-check", soloInput)
      : command === "submit" ? service.submit("renter-1", draft!.id, "submit-date-check")
      : service.accept("owner-1", draft!.id, "accept-date-check");
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ["2026-09-02T06:59:59.999Z", "2026-09-01"],
    ["2026-12-02T07:59:59.999Z", "2026-12-01"]
  ])("allows today's move-in before local midnight at %s", async (instant, moveIn) => {
    vi.setSystemTime(new Date(instant));
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = await service.create("renter-1", "create-today-check", { ...soloInput, moveIn });
    await service.submit("renter-1", draft.id, "submit-today-check");
    expect((await service.accept("owner-1", draft.id, "accept-today-check")).status).toBe("ACCEPTED");
    vi.setSystemTime(new Date("2027-02-01T12:00:00Z"));
    prisma.state.listings[0]!.status = "SUBMITTED";
    expect((await service.create("renter-1", "create-today-check", { ...soloInput, moveIn })).id).toBe(draft.id);
    expect((await service.submit("renter-1", draft.id, "submit-today-check")).id).toBe(draft.id);
    expect((await service.accept("owner-1", draft.id, "accept-today-check")).id).toBe(draft.id);
  });

  it.each(["create", "submit", "accept"] as const)("uses the transaction's current listing during %s", async (command) => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never, createPaymentsStub());
    const draft = command !== "create" ? await service.create("renter-1", "create-transaction", soloInput) : null;
    if (command === "accept") await service.submit("renter-1", draft!.id, "submit-transaction");
    // Root-client reads see the old listing; transaction reads see its new status.
    vi.spyOn(prisma, "$transaction").mockImplementation(async (operation) => operation({
      ...prisma,
      listing: { ...prisma.listing, findUnique: async () => ({ ...prisma.state.listings[0]!, status: "SUBMITTED" }) }
    }));
    const result = command === "create" ? service.create("renter-1", "create-transaction", soloInput)
      : command === "submit" ? service.submit("renter-1", draft!.id, "submit-transaction")
      : service.accept("owner-1", draft!.id, "accept-transaction");
    await expect(result).rejects.toThrow();
    expect(prisma.state.applications[0]?.status).toBe(command === "create" ? undefined : command === "submit" ? "DRAFT" : "SUBMITTED");
  });

  it("withdraws a draft idempotently and releases its active application slot", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const service = new ApplicationsService(prisma as never);
    const draft = await service.create("renter-1", "create-withdraw-draft", soloInput);
    await expect(service.withdraw("renter-2", draft.id, "withdraw-not-owner")).rejects.toBeInstanceOf(NotFoundException);
    const withdrawn = await service.withdraw("renter-1", draft.id, "withdraw-draft-key");
    expect(withdrawn).toMatchObject({ status: "WITHDRAWN", activeKey: null });
    expect((await service.withdraw("renter-1", draft.id, "withdraw-draft-key")).withdrawnAt).toEqual(withdrawn.withdrawnAt);
    expect((await service.create("renter-1", "create-after-withdraw", soloInput)).status).toBe("DRAFT");
  });
});


describe("Los Angeles application business date", () => {
  it.each([
    ["2026-09-02T06:59:59.999Z", "2026-09-01"],
    ["2026-09-02T07:00:00.000Z", "2026-09-02"],
    ["2026-12-02T07:59:59.999Z", "2026-12-01"],
    ["2026-12-02T08:00:00.000Z", "2026-12-02"],
    ["2026-03-08T09:59:59.999Z", "2026-03-08"],
    ["2026-03-08T10:00:00.000Z", "2026-03-08"]
  ])("maps %s to %s", (instant, expected) => {
    expect(applicationBusinessDate(new Date(instant))).toBe(expected);
  });
});
