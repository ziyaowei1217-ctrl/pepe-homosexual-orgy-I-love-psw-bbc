import { afterEach, describe, expect, it, vi } from "vitest";
import { createPaymentCommands, type PaymentCommands } from "../src/payments/payment-commands";
import { getPaymentMode } from "../src/payments/payment-mode";

afterEach(() => vi.unstubAllEnvs());

describe("hosted beta payment isolation", () => {
  it("retains strict real gateway configuration by default in production", () => {
    vi.stubEnv("PAYMENT_MODE", undefined);
    vi.stubEnv("PAYMENT_SERVICE_URL", undefined);
    expect(getPaymentMode("production")).toBe("production");
    expect(() => createPaymentCommands({ nodeEnv: "production" })).toThrow("PAYMENT_SERVICE_URL");
  });
  it("allows explicit simulated money with real production runtime, without contacting any gateway", () => {
    const fetchImpl = vi.fn();
    const local: PaymentCommands = { ensureOrderForAcceptedApplication: vi.fn(), refundForCancellation: vi.fn() };
    expect(createPaymentCommands({ nodeEnv: "production", paymentMode: "demo", developmentCommands: local, fetchImpl })).toBe(local);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(local.execution).not.toBe("remote");
  });
  it("rejects missing simulation implementation and invalid mode values", () => {
    expect(() => createPaymentCommands({ nodeEnv: "production", paymentMode: "demo" })).toThrow("Development payment commands");
    expect(() => getPaymentMode("production", "dev")).toThrow("PAYMENT_MODE");
    expect(() => getPaymentMode("production", "")).toThrow("PAYMENT_MODE");
  });
});
