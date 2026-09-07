import { Controller, Get, Headers, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { PaymentsService } from "./payments.service";

@UseGuards(AuthGuard)
@Controller("payments")
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get("configuration")
  configuration() { return this.payments.configuration(); }

  @Get("applications/:applicationId")
  status(@Req() request: AuthenticatedRequest, @Param("applicationId") applicationId: string) {
    return this.payments.status(request.user.id, applicationId);
  }

  @Post("applications/:applicationId/checkout")
  createCheckout(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId") applicationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ) {
    return this.payments.createCheckout(request.user.id, applicationId, idempotencyKey);
  }
}
