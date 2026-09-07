import { describe, expect, it, vi } from "vitest";
import { ServiceUnavailableException } from "@nestjs/common";

import { createPaymentCommands } from "../src/payments/payment-commands";

describe("payment command provider", () => {
  it("reads provider status and rejects malformed or unsafe provider responses as unavailable", async () => {
    let payload: unknown = { status: "PAID" };
    const commands = createPaymentCommands({ nodeEnv: "production", serviceUrl: "https://payments.example.com", apiKey: "test-key",
      fetchImpl: async () => new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } })
    });
    await expect(commands.getPaymentStatus?.("application-1")).resolves.toEqual({ status: "PAID" });
    for (const malformed of [null, { status: "NOT_A_PAYMENT_STATE" }]) {
      payload = malformed;
      await expect(commands.getPaymentStatus?.("application-1")).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
    for (const checkoutUrl of ["not a url", "https://username:password@checkout.example.com"]) {
      payload = { checkoutUrl };
      await expect(commands.createCheckoutSession?.("application-1", "renter-1", "checkout-key-1234"))
        .rejects.toBeInstanceOf(ServiceUnavailableException);
    }
  });
  it("refuses to boot production with demo payments", () => {
    expect(() => createPaymentCommands({ nodeEnv: "production" })).toThrow("PAYMENT_SERVICE_URL");
  });

  it("forwards accepted applications and cancellations to the configured gateway", async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request) => new Response(
      String(input).endsWith("/cancellations")
        ? JSON.stringify({ result: "REFUNDED" })
        : String(input).endsWith("/checkout-sessions")
          ? JSON.stringify({ checkoutUrl: "https://checkout.example.com/session-1" })
          : "{}",
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    const commands = createPaymentCommands({
      nodeEnv: "production",
      serviceUrl: "https://payments.example.com/v1",
      apiKey: "secret-key",
      fetchImpl
    });

    await commands.ensureOrderForAcceptedApplication({} as never, "application-1");
    await expect(commands.createCheckoutSession?.("application-1", "renter-1", "checkout-1"))
      .resolves.toEqual({ checkoutUrl: "https://checkout.example.com/session-1" });
    await expect(commands.refundForCancellation({} as never, "application-1", "owner-1", "cancel-1"))
      .resolves.toBe("REFUNDED");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
