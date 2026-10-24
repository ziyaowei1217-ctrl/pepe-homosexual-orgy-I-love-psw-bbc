export type PaymentMode = "production" | "demo";

// A hosted beta may use real accounts with explicitly simulated money. This
// does not relax NODE_ENV, authentication, email, database or storage checks.
export function getPaymentMode(nodeEnv = process.env.NODE_ENV ?? "development", value = process.env.PAYMENT_MODE): PaymentMode {
  if (value !== undefined && value !== "production" && value !== "demo") throw new Error("PAYMENT_MODE must be production or demo");
  return value ?? (nodeEnv === "production" ? "production" : "demo");
}
