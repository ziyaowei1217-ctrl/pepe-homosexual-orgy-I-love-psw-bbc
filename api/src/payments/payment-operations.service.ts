import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma, type PaymentOperationKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_COMMANDS, type PaymentCommands, type PaymentCancellationResult } from "./payment-commands";

/** Durable remote work. The provider must replay keys and fence cancelled checkout sessions. */
@Injectable()
export class PaymentOperationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentOperationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_COMMANDS) private readonly commands: PaymentCommands
  ) {}

  onModuleInit() {
    if (this.commands.execution !== "remote") return;
    this.timer = setInterval(() => { void this.runPending(); }, 5_000);
    this.timer.unref();
    void this.runPending();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.running;
  }

  async enqueue(transaction: Prisma.TransactionClient, applicationId: string, kind: PaymentOperationKind, actorId?: string) {
    const id = `${kind.toLowerCase()}/${applicationId}`;
    return transaction.paymentOperation.upsert({
      where: { applicationId_kind: { applicationId, kind } },
      update: {},
      create: { id, applicationId, kind, actorId, providerKey: kind === "ACCEPT" ? `accepted/${applicationId}` : `cancellation/${applicationId}` }
    });
  }

  async processApplication(applicationId: string) {
    const operations = await this.prisma.paymentOperation.findMany({
      where: { applicationId, status: "PENDING" }, orderBy: { kind: "asc" }
    });
    for (const operation of operations) await this.process(operation.id);
  }

  runPending(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.drain().catch(() => {
      this.logger.error("Payment recovery scan failed; the next scan will retry");
    }).finally(() => { this.running = undefined; });
    return this.running;
  }

  private async drain() {
    const now = new Date();
    const operations = await this.prisma.paymentOperation.findMany({
      where: { status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], take: 10
    });
    for (const operation of operations) await this.process(operation.id);
  }

  private async process(id: string) {
    const now = new Date();
    const lockToken = randomUUID();
    const claimed = await this.prisma.paymentOperation.updateMany({
      where: { id, status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }] },
      data: { lockToken, lockedUntil: new Date(now.getTime() + 30_000), attempts: { increment: 1 } }
    });
    if (!claimed.count) return;
    try {
      const operation = await this.prisma.paymentOperation.findUniqueOrThrow({ where: { id } });
      let result: PaymentCancellationResult | null = null;
      if (operation.kind === "ACCEPT") {
        // PrismaClient is passed only for interface compatibility with transactional demo commands.
        // There is deliberately no open transaction across either remote call.
        await this.commands.ensureOrderForAcceptedApplication(this.prisma, operation.applicationId);
      } else {
        const accepted = await this.prisma.paymentOperation.findUnique({
          where: { applicationId_kind: { applicationId: operation.applicationId, kind: "ACCEPT" } }
        });
        if (accepted && accepted.status !== "SUCCEEDED") throw new Error("Order is still pending");
        if (!operation.actorId) throw new Error("Cancellation actor is missing");
        result = await this.commands.refundForCancellation(this.prisma, operation.applicationId, operation.actorId, operation.providerKey);
      }

      await this.prisma.$transaction(async transaction => {
        const current = await transaction.paymentOperation.findUniqueOrThrow({ where: { id } });
        if (current.status !== "PENDING" || current.lockToken !== lockToken) return;
        if (current.kind === "CANCEL") {
          const released = result === "RELEASED";
          const updated = await transaction.rentalApplication.updateMany({
            where: { id: current.applicationId, status: "CANCELLATION_PENDING" },
            data: released
              ? { status: "ACCEPTED" }
              : { status: "CANCELLED", activeKey: null, acceptedListingKey: null, cancelledAt: new Date() }
          });
          if (updated.count !== 1) throw new Error("Cancellation reservation changed");
        }
        await transaction.paymentOperation.update({
          where: { id }, data: { status: result === "RELEASED" ? "BLOCKED" : "SUCCEEDED", result, lockToken: null, lockedUntil: null, lastError: null }
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch {
      // Includes a lost provider response, process restart, or failed local commit after remote success.
      // Replay the same durable provider key; never mark an uncertain refund as cancelled or failed.
      await this.prisma.paymentOperation.updateMany({
        where: { id, status: "PENDING", lockToken },
        data: { lockToken: null, lockedUntil: null, nextAttemptAt: new Date(Date.now() + 5_000), lastError: "Payment synchronization pending; retry scheduled" }
      }).catch(() => { /* A disconnected database leaves the lease to expire for recovery. */ });
    }
  }
}
