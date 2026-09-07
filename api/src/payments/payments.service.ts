import { ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";

import { requireIdempotencyKey } from "../applications/application-idempotency";
import { PrismaService } from "../prisma/prisma.service";
import { PAYMENT_COMMANDS, type PaymentCommands, type PaymentStatus } from "./payment-commands";
import { PaymentOperationsService } from "./payment-operations.service";

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_COMMANDS) private readonly commands: PaymentCommands,
    @Optional() @Inject(PaymentOperationsService) private readonly operations: PaymentOperationsService = new PaymentOperationsService(prisma, commands)
  ) {}

  configuration() {
    return { mode: this.commands.execution === "remote" ? "production" : "demo" };
  }

  async status(userId: string, applicationId: string): Promise<{ status: PaymentStatus }> {
    const application = await this.prisma.rentalApplication.findUnique({
      where: { id: applicationId }, include: { team: { include: { members: true } } }
    });
    if (!application || (application.submitterId !== userId && application.listingOwnerId !== userId &&
      !application.team?.members.some(member => member.userId === userId))) throw new NotFoundException("Application not found");
    if (application.status === "CANCELLATION_PENDING") return { status: "PROCESSING" };
    if (this.commands.execution !== "remote" || !this.commands.getPaymentStatus) {
      throw new ServiceUnavailableException("Production payment status is not configured in this environment");
    }
    const operations = await this.prisma.paymentOperation.findMany({ where: { applicationId } });
    if (operations.some(operation => operation.status === "PENDING")) return { status: "PROCESSING" };
    const cancellation = operations.find(operation => operation.kind === "CANCEL" && operation.status === "SUCCEEDED");
    if (cancellation) return { status: cancellation.result === "REFUNDED" ? "REFUNDED" : "CANCELLED" };
    if (application.status === "CANCELLED" || application.status === "WITHDRAWN" || application.status === "REJECTED") return { status: "CANCELLED" };
    return this.commands.getPaymentStatus(applicationId);
  }

  async createCheckout(userId: string, applicationId: string, rawIdempotencyKey: unknown) {
    const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);
    const application = await this.prisma.rentalApplication.findUnique({
      where: { id: applicationId },
      select: { submitterId: true, status: true }
    });
    if (!application || application.submitterId !== userId) throw new NotFoundException("Application not found");
    if (application.status !== "ACCEPTED") throw new ConflictException("Only accepted applications can enter checkout");
    if (!this.commands.createCheckoutSession) {
      throw new ServiceUnavailableException("Payment checkout is not configured in this environment");
    }
    if (this.commands.execution === "remote") {
      await this.operations.processApplication(applicationId);
      const payment = await this.status(userId, applicationId);
      if (payment.status !== "AWAITING_PAYMENT") throw new ConflictException("付款正在处理或已结束，请刷新状态");
    }
    const checkout = await this.commands.createCheckoutSession(applicationId, userId, `checkout/${applicationId}/${idempotencyKey}`);
    if (this.commands.execution === "remote") {
      const current = await this.prisma.rentalApplication.findUnique({ where: { id: applicationId } });
      if (current?.status !== "ACCEPTED") throw new ConflictException("申请状态已更新，请刷新后重试");
    }
    return checkout;
  }
}
