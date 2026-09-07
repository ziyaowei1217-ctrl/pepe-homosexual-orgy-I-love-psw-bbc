import { ServiceUnavailableException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export const PAYMENT_COMMANDS = Symbol("PAYMENT_COMMANDS");

export type PaymentCancellationResult = "NO_FUNDS" | "REFUNDED" | "RELEASED";
export type PaymentStatus = "AWAITING_PAYMENT" | "PROCESSING" | "PAID" | "REFUNDED" | "RELEASED" | "CANCELLED";

export type PaymentCommands = {
  execution?: "remote";
  getPaymentStatus?(applicationId: string): Promise<{ status: PaymentStatus }>;
  ensureOrderForAcceptedApplication(transaction: Prisma.TransactionClient, applicationId: string): Promise<unknown>;
  createCheckoutSession?(
    applicationId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<{ checkoutUrl: string }>;
  refundForCancellation(
    transaction: Prisma.TransactionClient,
    applicationId: string,
    actorId: string,
    idempotencyKey: string
  ): Promise<PaymentCancellationResult>;
};

type PaymentCommandsFactoryInput = {
  nodeEnv?: string;
  serviceUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  developmentCommands?: PaymentCommands;
};

export function createPaymentCommands(input: PaymentCommandsFactoryInput = {}): PaymentCommands {
  const nodeEnv = input.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv !== "production") {
    if (!input.developmentCommands) throw new Error("Development payment commands are required");
    return input.developmentCommands;
  }

  const serviceUrl = input.serviceUrl ?? process.env.PAYMENT_SERVICE_URL;
  const apiKey = input.apiKey ?? process.env.PAYMENT_SERVICE_API_KEY;
  if (!serviceUrl) throw new Error("PAYMENT_SERVICE_URL is required in production");
  if (!apiKey) throw new Error("PAYMENT_SERVICE_API_KEY is required in production");
  const url = new URL(serviceUrl);
  if (url.protocol !== "https:") throw new Error("PAYMENT_SERVICE_URL must use HTTPS in production");
  return new HttpPaymentCommands(url.href.replace(/\/+$/, ""), apiKey, input.fetchImpl ?? fetch);
}

class HttpPaymentCommands implements PaymentCommands {
  readonly execution = "remote" as const;
  constructor(private readonly serviceUrl: string, private readonly apiKey: string, private readonly fetchImpl: typeof fetch) {}

  async getPaymentStatus(applicationId: string): Promise<{ status: PaymentStatus }> {
    const payload = await this.request(`/applications/${encodeURIComponent(applicationId)}/status`) as { status?: unknown };
    const statuses: unknown[] = ["AWAITING_PAYMENT", "PROCESSING", "PAID", "REFUNDED", "RELEASED", "CANCELLED"];
    if (!statuses.includes(payload.status)) throw new ServiceUnavailableException("Payment gateway returned an invalid status");
    return { status: payload.status as PaymentStatus };
  }

  ensureOrderForAcceptedApplication(_transaction: Prisma.TransactionClient, applicationId: string) {
    return this.request(`/applications/${encodeURIComponent(applicationId)}/accepted`, {
      idempotencyKey: `accepted/${applicationId}`,
      body: { applicationId }
    });
  }

  async createCheckoutSession(applicationId: string, actorId: string, idempotencyKey: string) {
    const payload = await this.request(`/applications/${encodeURIComponent(applicationId)}/checkout-sessions`, {
      idempotencyKey,
      body: { applicationId, actorId }
    }) as { checkoutUrl?: unknown };
    if (typeof payload.checkoutUrl !== "string") {
      throw new ServiceUnavailableException("Payment gateway returned an invalid checkout session");
    }
    let checkoutUrl: URL;
    try { checkoutUrl = new URL(payload.checkoutUrl); }
    catch { throw new ServiceUnavailableException("Payment gateway returned an invalid checkout URL"); }
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.username || checkoutUrl.password) {
      throw new ServiceUnavailableException("Payment gateway returned an insecure checkout session");
    }
    return { checkoutUrl: checkoutUrl.href };
  }

  async refundForCancellation(
    _transaction: Prisma.TransactionClient,
    applicationId: string,
    actorId: string,
    idempotencyKey: string
  ) {
    const payload = await this.request(`/applications/${encodeURIComponent(applicationId)}/cancellations`, {
      idempotencyKey,
      body: { applicationId, actorId }
    }) as { result?: unknown };
    if (payload.result !== "NO_FUNDS" && payload.result !== "REFUNDED" && payload.result !== "RELEASED") {
      throw new ServiceUnavailableException("Payment gateway returned an invalid cancellation result");
    }
    return payload.result;
  }

  private async request(path: string, input?: { idempotencyKey: string; body: Record<string, string> }) {
    try {
      const response = await this.fetchImpl(`${this.serviceUrl}${path}`, {
        method: input ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(input ? { "Idempotency-Key": input.idempotencyKey } : {})
        },
        ...(input ? { body: JSON.stringify(input.body) } : {}),
        signal: AbortSignal.timeout(8_000)
      });
      if (!response.ok) throw new ServiceUnavailableException("Payment gateway request failed");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ServiceUnavailableException("Payment gateway returned an invalid response");
      return payload;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("Payment gateway is unavailable");
    }
  }
}
