import { ConflictException, NotFoundException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DemoPaymentsService } from "../src/demo-payments/demo-payments.service";
import { ApplicationsService } from "../src/applications/applications.service";
import { createMarketplaceDemoPrismaMock } from "./support/marketplace-demo-prisma-mock";

const applicationInput = {
  listingId: "listing-1",
  scope: "SOLO" as const,
  moveIn: "2026-09-01",
  moveOut: "2026-12-31",
  schoolOrOccupation: "UCLA student",
  incomeBand: "TWO_TO_THREE_X" as const,
  guarantorStatus: "AVAILABLE" as const,
  note: "Quiet and tidy."
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-31T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("DemoPaymentsService", () => {
  it("creates exactly one accepted-application order for one month of rent", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const application = await seedAcceptedApplication(prisma);
    const service = new DemoPaymentsService(prisma as never);

    const order = await service.ensureOrderForAcceptedApplication(prisma as never, application.id);
    const retry = await service.ensureOrderForAcceptedApplication(prisma as never, application.id);

    expect(order).toMatchObject({
      applicationId: application.id,
      payerId: "renter-1",
      payeeId: "owner-1",
      amountCents: 185000,
      currency: "USD",
      status: "AWAITING_ATTEMPT"
    });
    expect(retry.id).toBe(order.id);
    expect(prisma.state.demoPayments).toHaveLength(1);
  });

  it("allows only the applicant or owner to read and only the submitter to simulate", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const application = await seedAcceptedApplication(prisma);
    const service = new DemoPaymentsService(prisma as never);
    await service.ensureOrderForAcceptedApplication(prisma as never, application.id);

    await expect(service.findByApplication("stranger-1", application.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.findByApplication("owner-1", application.id)).payment.applicationId).toBe(application.id);
    await expect(service.simulateFailure("owner-1", application.id, "failure-key-owner"))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it("records deterministic failures, then holds once on first success with a balanced ledger", async () => {
    const prisma = createMarketplaceDemoPrismaMock();
    const application = await seedAcceptedApplication(prisma);
    const service = new DemoPaymentsService(prisma as never);
    await service.ensureOrderForAcceptedApplication(prisma as never, application.id);

    const failed = await service.simulateFailure("renter-1", application.id, "failure-key-0001");
    expect(failed.payment.status).toBe("AWAITING_ATTEMPT");
    expect(failed.attempts).toEqual([expect.objectContaining({ outcome: "FAILED", applied: false })]);
    expect((await service.simulateFailure("renter-1", application.id, "failure-key-0001")).attempts).toHaveLength(1);

    const held = await service.simulateSuccess("renter-1", application.id, "success-key-0001");
    expect(held.payment.status).toBe("HELD");
    expect(held.heldFund).toMatchObject({ status: "HELD", amountCents: 185000 });
    expect(held.ledgerEntries).toHaveLength(2);
    expect(balance(held.ledgerEntries)).toBe(0);

    const repeated = await service.simulateSuccess("renter-1", application.id, "success-key-0002");
    expect(repeated.heldFund?.id).toBe(held.heldFund?.id);
    expect(repeated.attempts.at(-1)).toMatchObject({ outcome: "SUCCEEDED", applied: false });
    expect(repeated.ledgerEntries).toHaveLength(2);
  });

  it("closes an unpaid order without a refund posting and refunds held funds once", async () => {
    const unpaidPrisma = createMarketplaceDemoPrismaMock();
    const unpaidApplication = await seedAcceptedApplication(unpaidPrisma);
    const unpaidService = new DemoPaymentsService(unpaidPrisma as never);
    await unpaidService.ensureOrderForAcceptedApplication(unpaidPrisma as never, unpaidApplication.id);
    await expect(unpaidService.refundForCancellation(
      unpaidPrisma as never,
      unpaidApplication.id,
      "renter-1",
      "cancel-key-unpaid"
    )).resolves.toBe("NO_FUNDS");
    expect(unpaidPrisma.state.demoPayments[0]!.status).toBe("CLOSED");
    expect(unpaidPrisma.state.demoLedgerEntries).toEqual([]);

    const heldPrisma = createMarketplaceDemoPrismaMock();
    const heldApplication = await seedAcceptedApplication(heldPrisma);
    const heldService = new DemoPaymentsService(heldPrisma as never);
    await heldService.ensureOrderForAcceptedApplication(heldPrisma as never, heldApplication.id);
    await heldService.simulateSuccess("renter-1", heldApplication.id, "success-key-held");
    await expect(heldService.refundForCancellation(
      heldPrisma as never,
      heldApplication.id,
      "owner-1",
      "cancel-key-held"
    )).resolves.toBe("REFUNDED");
    await expect(heldService.refundForCancellation(
      heldPrisma as never,
      heldApplication.id,
      "owner-1",
      "cancel-key-held"
    )).resolves.toBe("REFUNDED");
    expect(heldPrisma.state.demoHeldFunds[0]!.status).toBe("REFUNDED");
    expect(heldPrisma.state.demoLedgerEntries.filter((entry: { event: string }) => entry.event === "REFUND")).toHaveLength(2);
  });

  it("enforces the move-in date and releases only after renter and owner confirmations", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T23:59:59.000Z"));
    const prisma = createMarketplaceDemoPrismaMock();
    const application = await seedAcceptedApplication(prisma);
    const service = new DemoPaymentsService(prisma as never);
    await service.ensureOrderForAcceptedApplication(prisma as never, application.id);
    const held = await service.simulateSuccess("renter-1", application.id, "success-key-0001");

    await expect(service.confirmMoveIn("renter-1", held.heldFund!.id, "confirm-key-renter"))
      .rejects.toMatchObject({
        response: {
          code: "DEMO_MOVE_IN_NOT_STARTED",
          message: "约定入住日期前不能确认入住"
        }
      });
    vi.setSystemTime(new Date("2026-09-01T12:00:00.000Z"));
    const renterConfirmed = await service.confirmMoveIn("renter-1", held.heldFund!.id, "confirm-key-renter");
    expect(renterConfirmed.heldFund).toMatchObject({ status: "HELD", renterConfirmedAt: expect.any(Date) });
    const renterRetry = await service.confirmMoveIn("renter-1", held.heldFund!.id, "different-renter-key");
    expect(renterRetry.heldFund?.renterConfirmationKey).toBe("confirm-key-renter");

    const released = await service.confirmMoveIn("owner-1", held.heldFund!.id, "confirm-key-owner");
    expect(released.payment.status).toBe("RELEASED");
    expect(released.heldFund).toMatchObject({ status: "RELEASED", ownerConfirmedAt: expect.any(Date) });
    expect(released.application.status).toBe("COMPLETED");
    expect(released.application.acceptedListingKey).toBe("listing-1");
    expect(released.ledgerEntries.filter((entry) => entry.event === "RELEASE")).toHaveLength(2);
    expect(balance(released.ledgerEntries)).toBe(0);
    await expect(service.refundForCancellation(prisma as never, application.id, "owner-1", "cancel-after-release"))
      .resolves.toBe("RELEASED");
  });
});

async function seedAcceptedApplication(prisma: ReturnType<typeof createMarketplaceDemoPrismaMock>) {
  const applications = new ApplicationsService(prisma as never);
  const draft = await applications.create("renter-1", "create-key-0001", applicationInput);
  await applications.submit("renter-1", draft.id, "submit-key-0001");
  Object.assign(prisma.state.applications[0]!, {
    status: "ACCEPTED",
    acceptedListingKey: "listing-1",
    decidedAt: new Date("2026-08-20T00:00:00.000Z"),
    decisionById: "owner-1"
  });
  return prisma.state.applications[0]!;
}

function balance(entries: Array<{ direction: string; amountCents: number }>) {
  return entries.reduce((total, entry) => total + (entry.direction === "DEBIT" ? entry.amountCents : -entry.amountCents), 0);
}
