import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { PaymentsService } from "../src/payments/payments.service";

describe("production checkout service", () => {
  it("reports payment mode from the active backend provider", () => {
    expect(new PaymentsService({} as never, { execution: "remote" } as never).configuration()).toEqual({ mode: "production" });
    expect(new PaymentsService({} as never, {} as never).configuration()).toEqual({ mode: "demo" });
  });

  it("reports an unresolved cancellation as processing without querying or reopening checkout", async () => {
    const service = new PaymentsService({ rentalApplication: {
      findUnique: async () => ({ submitterId: "renter-1", status: "CANCELLATION_PENDING" })
    } } as never, { execution: "remote" } as never);
    await expect(service.status("renter-1", "application-1")).resolves.toEqual({ status: "PROCESSING" });
    await expect(service.createCheckout("renter-1", "application-1", "checkout-key-1234")).rejects.toThrow("accepted");
  });
  it("creates checkout only for the accepted application's submitter", async () => {
    const prisma = {
      rentalApplication: {
        findUnique: vi.fn(async () => ({ submitterId: "renter-1", status: "ACCEPTED" }))
      }
    };
    const commands = {
      createCheckoutSession: vi.fn(async () => ({ checkoutUrl: "https://checkout.example.com/session-1" }))
    };
    const service = new PaymentsService(prisma as never, commands as never);

    await expect(service.createCheckout("renter-1", "application-1", "checkout-1"))
      .resolves.toEqual({ checkoutUrl: "https://checkout.example.com/session-1" });
    expect(commands.createCheckoutSession).toHaveBeenCalledWith("application-1", "renter-1", "checkout/application-1/checkout-1");
  });

  it("does not reveal another renter's application", async () => {
    const prisma = {
      rentalApplication: {
        findUnique: vi.fn(async () => ({ submitterId: "renter-2", status: "ACCEPTED" }))
      }
    };
    const service = new PaymentsService(prisma as never, { createCheckoutSession: vi.fn() } as never);

    await expect(service.createCheckout("renter-1", "application-1", "checkout-1"))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
