import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  DemoLedgerEvent,
  DemoPaymentAttemptOutcome,
  DemoPaymentStatus,
  Prisma,
  type RentalApplication
} from "@prisma/client";

import { requireIdempotencyKey } from "../applications/application-idempotency";
import { PrismaService } from "../prisma/prisma.service";
import { postDemoLedgerPair } from "./demo-ledger";
import { presentDemoPaymentState } from "./demo-payments.presenter";

type PaymentTransaction = Pick<
  Prisma.TransactionClient,
  "rentalApplication" | "listing" | "roommateTeam" | "demoPayment" | "demoPaymentAttempt" | "demoHeldFund" | "demoLedgerEntry"
>;

const terminalPaymentStatuses = new Set<DemoPaymentStatus>([
  DemoPaymentStatus.REFUNDED,
  DemoPaymentStatus.RELEASED,
  DemoPaymentStatus.CLOSED
]);

@Injectable()
export class DemoPaymentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ensureOrderForAcceptedApplication(transaction: PaymentTransaction, applicationId: string) {
    const existing = await transaction.demoPayment.findUnique({ where: { applicationId } });
    if (existing) return existing;
    const application = await transaction.rentalApplication.findUnique({ where: { id: applicationId } });
    if (!application || application.status !== "ACCEPTED") {
      throw new ConflictException("只有已接受申请可以创建演示支付订单");
    }
    const listing = await transaction.listing.findUnique({ where: { id: application.listingId } });
    if (!listing) throw new ConflictException("申请房源已不可用");
    const amountCents = listing.price * 100;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new ConflictException("演示支付金额不可用");
    }
    try {
      return await transaction.demoPayment.create({
        data: {
          applicationId,
          payerId: application.submitterId,
          payeeId: application.listingOwnerId,
          amountCents,
          currency: "USD",
          status: DemoPaymentStatus.AWAITING_ATTEMPT
        }
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await transaction.demoPayment.findUnique({ where: { applicationId } });
      if (winner) return winner;
      throw new ConflictException("演示支付订单状态已更新，请刷新后重试");
    }
  }

  async findByApplication(userId: string, applicationId: string) {
    const application = await this.prisma.rentalApplication.findUnique({ where: { id: applicationId } });
    if (!application || !(await this.canViewApplication(this.prisma, userId, application))) {
      throw new NotFoundException("Demo payment not found");
    }
    const payment = await this.prisma.demoPayment.findUnique({ where: { applicationId } });
    if (!payment) throw new NotFoundException("Demo payment not found");
    return this.buildState(this.prisma, payment.id);
  }

  simulateSuccess(userId: string, applicationId: string, rawKey: unknown) {
    return this.simulate(userId, applicationId, rawKey, DemoPaymentAttemptOutcome.SUCCEEDED);
  }

  simulateFailure(userId: string, applicationId: string, rawKey: unknown) {
    return this.simulate(userId, applicationId, rawKey, DemoPaymentAttemptOutcome.FAILED);
  }

  async refundForCancellation(
    transaction: PaymentTransaction,
    applicationId: string,
    actorId: string,
    rawKey: unknown
  ): Promise<"NO_FUNDS" | "REFUNDED" | "RELEASED"> {
    const refundKey = requireIdempotencyKey(rawKey);
    const application = await transaction.rentalApplication.findUnique({ where: { id: applicationId } });
    if (!application || (application.submitterId !== actorId && application.listingOwnerId !== actorId)) {
      throw new NotFoundException("Rental application not found");
    }
    const payment = await transaction.demoPayment.findUnique({ where: { applicationId } });
    if (!payment) return "NO_FUNDS";
    const heldFund = await transaction.demoHeldFund.findUnique({ where: { paymentId: payment.id } });
    if (!heldFund) {
      if (payment.status === DemoPaymentStatus.AWAITING_ATTEMPT) {
        await transaction.demoPayment.updateMany({
          where: { id: payment.id, status: DemoPaymentStatus.AWAITING_ATTEMPT },
          data: { status: DemoPaymentStatus.CLOSED }
        });
      }
      return "NO_FUNDS";
    }
    if (heldFund.status === "RELEASED") return "RELEASED";
    if (heldFund.status === "REFUNDED") return "REFUNDED";

    const now = new Date();
    const transition = await transaction.demoHeldFund.updateMany({
      where: { id: heldFund.id, status: "HELD" },
      data: { status: "REFUNDED", refundedAt: now, refundKey }
    });
    if (transition.count !== 1) {
      const current = await transaction.demoHeldFund.findUnique({ where: { id: heldFund.id } });
      if (current?.status === "RELEASED") return "RELEASED";
      if (current?.status === "REFUNDED") return "REFUNDED";
      throw new ConflictException("持有资金状态已更新，请刷新后重试");
    }
    await transaction.demoPayment.updateMany({
      where: { id: payment.id, status: DemoPaymentStatus.HELD },
      data: { status: DemoPaymentStatus.REFUNDED }
    });
    await postDemoLedgerPair(transaction, {
      paymentId: payment.id,
      heldFundId: heldFund.id,
      event: DemoLedgerEvent.REFUND,
      amountCents: heldFund.amountCents,
      idempotencyKey: refundKey
    });
    return "REFUNDED";
  }

  async confirmMoveIn(userId: string, heldFundId: string, rawKey: unknown) {
    const confirmationKey = requireIdempotencyKey(rawKey);
    return this.prisma.$transaction(async (transaction) => {
      const heldFund = await transaction.demoHeldFund.findUnique({ where: { id: heldFundId } });
      if (!heldFund) throw new NotFoundException("Held fund not found");
      const payment = await transaction.demoPayment.findUnique({ where: { id: heldFund.paymentId } });
      if (!payment) throw new NotFoundException("Held fund not found");
      const application = await transaction.rentalApplication.findUnique({ where: { id: payment.applicationId } });
      if (!application || (application.submitterId !== userId && application.listingOwnerId !== userId)) {
        throw new NotFoundException("Held fund not found");
      }
      if (Date.now() < application.moveIn.getTime()) {
        throw new ConflictException("约定入住日期前不能确认入住");
      }
      if (heldFund.status === "REFUNDED") throw new ConflictException("已退款资金不能确认入住");
      const isRenter = application.submitterId === userId;
      const confirmedAt = isRenter ? heldFund.renterConfirmedAt : heldFund.ownerConfirmedAt;
      if (!confirmedAt) {
        if (heldFund.status !== "HELD") throw new ConflictException("资金状态已结束");
        const data = isRenter
          ? { renterConfirmedAt: new Date(), renterConfirmationKey: confirmationKey }
          : { ownerConfirmedAt: new Date(), ownerConfirmationKey: confirmationKey };
        const updated = await transaction.demoHeldFund.updateMany({
          where: { id: heldFund.id, status: "HELD" },
          data
        });
        if (updated.count !== 1) throw new ConflictException("入住确认状态已更新，请刷新后重试");
      }

      const current = await transaction.demoHeldFund.findUnique({ where: { id: heldFund.id } });
      if (!current) throw new ConflictException("入住确认状态已更新，请刷新后重试");
      if (current.status === "HELD" && current.renterConfirmedAt && current.ownerConfirmedAt) {
        const releasedAt = new Date();
        const released = await transaction.demoHeldFund.updateMany({
          where: { id: current.id, status: "HELD" },
          data: { status: "RELEASED", releasedAt, releaseKey: confirmationKey }
        });
        if (released.count === 1) {
          await transaction.demoPayment.updateMany({
            where: { id: payment.id, status: DemoPaymentStatus.HELD },
            data: { status: DemoPaymentStatus.RELEASED }
          });
          await postDemoLedgerPair(transaction, {
            paymentId: payment.id,
            heldFundId: current.id,
            event: DemoLedgerEvent.RELEASE,
            amountCents: current.amountCents,
            idempotencyKey: confirmationKey
          });
          await transaction.rentalApplication.updateMany({
            where: { id: application.id, status: "ACCEPTED" },
            data: { status: "COMPLETED" }
          });
        }
      }
      return this.buildState(transaction, payment.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async simulate(
    userId: string,
    applicationId: string,
    rawKey: unknown,
    outcome: DemoPaymentAttemptOutcome
  ) {
    const idempotencyKey = requireIdempotencyKey(rawKey);
    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.rentalApplication.findUnique({ where: { id: applicationId } });
      if (!application || application.submitterId !== userId) throw new NotFoundException("Demo payment not found");
      const payment = await transaction.demoPayment.findUnique({ where: { applicationId } });
      if (!payment) throw new NotFoundException("Demo payment not found");
      const retry = await transaction.demoPaymentAttempt.findUnique({ where: { idempotencyKey } });
      if (retry) {
        if (retry.paymentId !== payment.id || retry.actorId !== userId || retry.outcome !== outcome) {
          throw new ConflictException("Idempotency-Key is already bound to a different payment attempt");
        }
        return this.buildState(transaction, payment.id);
      }
      if (terminalPaymentStatuses.has(payment.status)) {
        throw new ConflictException("演示支付订单已结束");
      }
      if (outcome === DemoPaymentAttemptOutcome.FAILED) {
        if (payment.status !== DemoPaymentStatus.AWAITING_ATTEMPT) throw new ConflictException("资金已持有，不能模拟失败");
        await transaction.demoPaymentAttempt.create({
          data: { paymentId: payment.id, actorId: userId, idempotencyKey, outcome, applied: false }
        });
        return this.buildState(transaction, payment.id);
      }

      if (payment.status === DemoPaymentStatus.HELD) {
        await transaction.demoPaymentAttempt.create({
          data: { paymentId: payment.id, actorId: userId, idempotencyKey, outcome, applied: false }
        });
        return this.buildState(transaction, payment.id);
      }

      const heldFund = await transaction.demoHeldFund.create({
        data: {
          paymentId: payment.id,
          amountCents: payment.amountCents,
          status: "HELD",
          renterConfirmedAt: null,
          ownerConfirmedAt: null,
          renterConfirmationKey: null,
          ownerConfirmationKey: null,
          refundKey: null,
          releaseKey: null,
          refundedAt: null,
          releasedAt: null
        }
      });
      await transaction.demoPaymentAttempt.create({
        data: { paymentId: payment.id, actorId: userId, idempotencyKey, outcome, applied: true }
      });
      await transaction.demoPayment.updateMany({
        where: { id: payment.id, status: DemoPaymentStatus.AWAITING_ATTEMPT },
        data: { status: DemoPaymentStatus.HELD }
      });
      await postDemoLedgerPair(transaction, {
        paymentId: payment.id,
        heldFundId: heldFund.id,
        event: DemoLedgerEvent.HOLD,
        amountCents: payment.amountCents,
        idempotencyKey
      });
      return this.buildState(transaction, payment.id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async buildState(transaction: PaymentTransaction, paymentId: string) {
    const payment = await transaction.demoPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException("Demo payment not found");
    const [application, attempts, heldFund, ledgerEntries] = await Promise.all([
      transaction.rentalApplication.findUnique({ where: { id: payment.applicationId } }),
      transaction.demoPaymentAttempt.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } }),
      transaction.demoHeldFund.findUnique({ where: { paymentId } }),
      transaction.demoLedgerEntry.findMany({ where: { paymentId }, orderBy: { createdAt: "asc" } })
    ]);
    if (!application) throw new NotFoundException("Demo payment not found");
    return presentDemoPaymentState({ payment, application, attempts, heldFund, ledgerEntries });
  }

  private async canViewApplication(transaction: PaymentTransaction, userId: string, application: RentalApplication) {
    if (application.submitterId === userId || application.listingOwnerId === userId) return true;
    if (!application.teamId) return false;
    const team = await transaction.roommateTeam.findUnique({ where: { id: application.teamId }, include: { members: true } });
    return Boolean(team?.members.some((member) => member.userId === userId));
  }
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
