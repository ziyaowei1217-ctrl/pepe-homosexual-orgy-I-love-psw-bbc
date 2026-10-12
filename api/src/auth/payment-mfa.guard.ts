import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { PAYMENT_COMMANDS, type PaymentCommands } from "../payments/payment-commands";
import { MfaGuard } from "./mfa.guard";
// Demo funds have no external value. Every remote payment command, including
// one supplied in development, requires independent verification.
@Injectable()
export class PaymentMfaGuard implements CanActivate {
  constructor(@Inject(PAYMENT_COMMANDS) private readonly payments: PaymentCommands, @Inject(MfaGuard) private readonly mfa: MfaGuard) {}
  canActivate(context: ExecutionContext) { return this.payments.execution === "remote" ? this.mfa.canActivate(context) : true; }
}
