import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ApplicationsService } from "../src/applications/applications.service";
import { PaymentOperationsService } from "../src/payments/payment-operations.service";
import { PaymentsService } from "../src/payments/payments.service";
import type { PaymentCommands } from "../src/payments/payment-commands";
import { createPaymentCommands } from "../src/payments/payment-commands";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("remote_payment_recovery");
const describeDatabase = process.env.RUN_DB_SMOKE === "1" ? describe : describe.skip;

describeDatabase("remote payment recovery with PostgreSQL", () => {
  let prisma: PrismaClient;
  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await prisma.user.createMany({ data: [
      { id: "owner", email: "owner@payment-test.example" },
      { id: "renter", email: "renter@payment-test.example" }
    ] });
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); database.drop(); });

  it("commits cancellation even when the successful gateway refund exceeds five seconds", async () => {
    const commands = {
      execution: "remote" as const,
      ensureOrderForAcceptedApplication: async () => undefined,
      refundForCancellation: async () => {
        await new Promise(resolve => setTimeout(resolve, 6_000));
        return "REFUNDED" as const;
      }
    };
    const service = new ApplicationsService(prisma as never, commands);
    await prisma.listing.create({ data: {
      id: "slow-refund", ownerId: "owner", title: "Remote payment test", area: "Westwood",
      price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: "", transit: "", trust: "", tags: [],
      availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31"), status: "APPROVED"
    } });
    const draft = await service.create("renter", "create-slow-refund", {
      listingId: "slow-refund", scope: "SOLO", moveIn: "2099-02-01", moveOut: "2099-03-01",
      schoolOrOccupation: "Test", incomeBand: "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE", note: ""
    });
    await service.submit("renter", draft.id, "submit-slow-refund");
    await service.accept("owner", draft.id, "accept-slow-refund");
    await expect(service.cancel("renter", draft.id, "cancel-slow-refund", { reason: "Changed plans" }))
      .resolves.toMatchObject({ status: "CANCELLED" });
    expect(await prisma.rentalApplication.findUnique({ where: { id: draft.id } }))
      .toMatchObject({ status: "CANCELLED", acceptedListingKey: null, activeKey: null });
  }, 15_000);

  it("recovers a failed local commit after the remote refund succeeded using the same provider key", async () => {
    const refunds = new Set<string>();
    const keys: string[] = [];
    const commands: PaymentCommands = {
      execution: "remote",
      ensureOrderForAcceptedApplication: async () => undefined,
      refundForCancellation: async (_client, _id, _actor, key) => { keys.push(key); refunds.add(key); return "REFUNDED"; }
    };
    const { service, id } = await acceptedApplication("commit-failure", commands);
    await prisma.$executeRawUnsafe(`ALTER TABLE "RentalApplication" ADD CONSTRAINT "test_cancel_commit_failure" CHECK ("status"::text <> 'CANCELLED') NOT VALID`);
    try {
      expect(await service.cancel("renter", id, "cancel-commit-failure", { reason: "Changed plans" }))
        .toMatchObject({ status: "CANCELLATION_PENDING", acceptedListingKey: "commit-failure" });
      expect(refunds.size).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`ALTER TABLE "RentalApplication" DROP CONSTRAINT "test_cancel_commit_failure"`);
    }
    await makeDue(id);
    // A new worker instance stands in for a restarted process: all recovery state is in PostgreSQL.
    await new PaymentOperationsService(prisma as never, commands).runPending();
    expect(await prisma.rentalApplication.findUnique({ where: { id } }))
      .toMatchObject({ status: "CANCELLED", activeKey: null, acceptedListingKey: null });
    expect(keys).toEqual([`cancellation/${id}`, `cancellation/${id}`]);
    expect(refunds.size).toBe(1);
    expect(await prisma.paymentOperation.findUnique({ where: { applicationId_kind: { applicationId: id, kind: "CANCEL" } } }))
      .toMatchObject({ status: "SUCCEEDED", result: "REFUNDED", attempts: 2 });
  });

  it("keeps an uncertain refund reserved, blocks checkout, and recovers a lost response", async () => {
    let loseResponse = true;
    const refundedKeys = new Set<string>();
    const commands: PaymentCommands = {
      execution: "remote", ensureOrderForAcceptedApplication: async () => undefined,
      refundForCancellation: async (_client, _id, _actor, key) => {
        refundedKeys.add(key);
        if (loseResponse) { loseResponse = false; throw new Error("Connection lost after refund"); }
        return "REFUNDED";
      }
    };
    const { service, id } = await acceptedApplication("lost-response", commands);
    expect(await service.cancel("renter", id, "cancel-lost-response", { reason: "Changed plans" }))
      .toMatchObject({ status: "CANCELLATION_PENDING" });
    const checkout = new PaymentsService(prisma as never, commands);
    expect(await checkout.status("renter", id)).toEqual({ status: "PROCESSING" });
    await expect(checkout.createCheckout("renter", id, "checkout-blocked")).rejects.toThrow("accepted");
    await expect(service.cancel("owner", id, "cancel-competing-owner", { reason: "Different request" })).rejects.toThrow("已接受");
    await makeDue(id);
    expect(await new ApplicationsService(prisma as never, commands).cancel("renter", id, "cancel-lost-response", { reason: "Changed plans" }))
      .toMatchObject({ status: "CANCELLED" });
    expect(refundedKeys.size).toBe(1);
  });

  it("waits for durable order creation before refunding and survives an abandoned worker lease", async () => {
    let failOrder = true;
    let refunds = 0;
    const commands: PaymentCommands = {
      execution: "remote",
      ensureOrderForAcceptedApplication: async () => { if (failOrder) throw new Error("Gateway offline"); },
      refundForCancellation: async () => { refunds += 1; return "NO_FUNDS"; }
    };
    const { service, id } = await acceptedApplication("order-offline", commands);
    await service.cancel("renter", id, "cancel-order-offline", { reason: "Changed plans" });
    expect(refunds).toBe(0);
    failOrder = false;
    await makeDue(id);
    await prisma.paymentOperation.updateMany({ where: { applicationId: id }, data: { lockToken: "dead-worker", lockedUntil: new Date(Date.now() - 1_000) } });
    await new PaymentOperationsService(prisma as never, commands).runPending();
    expect(await prisma.rentalApplication.findUnique({ where: { id } })).toMatchObject({ status: "CANCELLED" });
    expect(refunds).toBe(1);
  });

  it("retains an accepted application and refuses repeated cancellation after released funds", async () => {
    const commands: PaymentCommands = {
      execution: "remote", ensureOrderForAcceptedApplication: async () => undefined,
      refundForCancellation: async () => "RELEASED"
    };
    const { service, id } = await acceptedApplication("released-funds", commands);
    await expect(service.cancel("renter", id, "cancel-released-funds", { reason: "Changed plans" })).rejects.toThrow("资金已释放");
    await expect(service.cancel("renter", id, "cancel-released-funds", { reason: "Changed plans" })).rejects.toThrow("资金已释放");
    expect(await prisma.rentalApplication.findUnique({ where: { id } }))
      .toMatchObject({ status: "ACCEPTED", acceptedListingKey: "released-funds", cancelledAt: null });
    expect(await prisma.paymentOperation.findUnique({ where: { applicationId_kind: { applicationId: id, kind: "CANCEL" } } }))
      .toMatchObject({ status: "BLOCKED", attempts: 1 });
  });

  it("allows only one worker to run an outstanding refund", async () => {
    let startRefund!: () => void;
    let finishRefund!: () => void;
    const started = new Promise<void>(resolve => { startRefund = resolve; });
    const finish = new Promise<void>(resolve => { finishRefund = resolve; });
    let refunds = 0;
    const commands: PaymentCommands = {
      execution: "remote", ensureOrderForAcceptedApplication: async () => undefined,
      refundForCancellation: async () => { refunds += 1; startRefund(); await finish; return "REFUNDED"; }
    };
    const { service, id } = await acceptedApplication("concurrent-worker", commands);
    const cancellation = service.cancel("renter", id, "cancel-concurrent-worker", { reason: "Changed plans" });
    await started;
    try {
      await new PaymentOperationsService(prisma as never, commands).runPending();
      expect(refunds).toBe(1);
      expect(await service.cancel("renter", id, "cancel-concurrent-worker", { reason: "Changed plans" }))
        .toMatchObject({ status: "CANCELLATION_PENDING" });
    } finally { finishRefund(); }
    expect(await cancellation).toMatchObject({ status: "CANCELLED" });
  });

  it("rejects overlapping and subsequent checkout when a contract-compliant adapter fences cancellation", async () => {
    let fenced = false;
    let beginCheckout!: () => void;
    let finishCheckout!: () => void;
    const started = new Promise<void>(resolve => { beginCheckout = resolve; });
    const finish = new Promise<void>(resolve => { finishCheckout = resolve; });
    const commands = createPaymentCommands({
      nodeEnv: "production", serviceUrl: "https://contract-test.example", apiKey: "test-credential",
      fetchImpl: async input => {
        const path = new URL(String(input)).pathname;
        const json = (value: object, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
        if (path.endsWith("/accepted")) return json({});
        if (path.endsWith("/status")) return json({ status: fenced ? "CANCELLED" : "AWAITING_PAYMENT" });
        if (path.endsWith("/cancellations")) { fenced = true; return json({ result: "NO_FUNDS" }); }
        if (path.endsWith("/checkout-sessions")) {
          beginCheckout(); await finish;
          return fenced ? json({ error: "Order is permanently cancelled" }, 409) : json({ checkoutUrl: "https://checkout.example/session" });
        }
        return json({}, 404);
      }
    });
    const { service, id } = await acceptedApplication("checkout-overlap", commands);
    const payments = new PaymentsService(prisma as never, commands);
    const opening = payments.createCheckout("renter", id, "checkout-overlap-key").then(
      value => ({ value, error: null }), error => ({ value: null, error })
    );
    await started;
    try {
      expect(await service.cancel("renter", id, "cancel-checkout-overlap", { reason: "Changed plans" }))
        .toMatchObject({ status: "CANCELLED" });
    } finally { finishCheckout(); }
    const outcome = await opening;
    expect(outcome.value).toBeNull();
    expect(outcome.error).toBeInstanceOf(Error);
    await expect(payments.createCheckout("renter", id, "checkout-after-cancel")).rejects.toThrow("accepted");
    expect(await payments.status("renter", id)).toEqual({ status: "CANCELLED" });
  });

  async function acceptedApplication(listingId: string, commands: PaymentCommands) {
    await prisma.listing.create({ data: {
      id: listingId, ownerId: "owner", title: "Remote payment test", area: "Westwood",
      price: 1800, originalPrice: 1800, beds: 1, baths: 1, commute: "", transit: "", trust: "", tags: [],
      availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31"), status: "APPROVED"
    } });
    const service = new ApplicationsService(prisma as never, commands);
    const draft = await service.create("renter", `create-${listingId}`, {
      listingId, scope: "SOLO", moveIn: "2099-02-01", moveOut: "2099-03-01",
      schoolOrOccupation: "Test", incomeBand: "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE", note: ""
    });
    await service.submit("renter", draft.id, `submit-${listingId}`);
    await service.accept("owner", draft.id, `accept-${listingId}`);
    return { service, id: draft.id };
  }

  it("prioritizes overdue work and excludes active leases before limiting the recovery batch", async () => {
    const attempted: string[] = [];
    const commands: PaymentCommands = {
      execution: "remote",
      ensureOrderForAcceptedApplication: async (_client, id) => { attempted.push(id); },
      refundForCancellation: async () => "NO_FUNDS"
    };
    const ids: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      ids.push((await acceptedApplication(`fairness-${index}`, commands)).id);
    }
    await prisma.paymentOperation.updateMany({ where: { applicationId: { in: ids } }, data: { status: "PENDING", nextAttemptAt: new Date(Date.now() - 1_000) } });
    await prisma.paymentOperation.updateMany({ where: { applicationId: ids[10] }, data: { nextAttemptAt: new Date(Date.now() - 60_000) } });
    attempted.length = 0;
    await new PaymentOperationsService(prisma as never, commands).runPending();
    expect(attempted[0]).toBe(ids[10]);

    await prisma.paymentOperation.updateMany({ where: { applicationId: { in: ids } }, data: {
      status: "PENDING", nextAttemptAt: new Date(Date.now() - 1_000), lockedUntil: new Date(Date.now() + 30_000), lockToken: "other-worker"
    } });
    await prisma.paymentOperation.updateMany({ where: { applicationId: ids[10] }, data: { lockedUntil: null, lockToken: null } });
    attempted.length = 0;
    await new PaymentOperationsService(prisma as never, commands).runPending();
    expect(attempted).toEqual([ids[10]]);
  });

  async function makeDue(applicationId: string) {
    await prisma.paymentOperation.updateMany({ where: { applicationId, status: "PENDING" }, data: { nextAttemptAt: new Date(Date.now() - 1_000) } });
  }
});
