import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
  type PipeTransform
} from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { DemoPaymentsService } from "./demo-payments.service";

const emptyCommandPipe: PipeTransform = {
  transform(value: unknown) {
    if (value === undefined || value === null) return {};
    if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0) {
      throw new BadRequestException("This demo command does not accept payment credentials or request fields");
    }
    return value;
  }
};

@UseGuards(AuthGuard)
@Controller("demo-payments")
export class DemoPaymentsController {
  constructor(@Inject(DemoPaymentsService) private readonly payments: DemoPaymentsService) {}

  @Get("by-application/:applicationId")
  findByApplication(@Req() request: AuthenticatedRequest, @Param("applicationId") applicationId: string) {
    return this.payments.findByApplication(request.user.id, applicationId);
  }

  @Post("by-application/:applicationId/simulate-success")
  simulateSuccess(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId") applicationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(emptyCommandPipe) _body: Record<string, never>
  ) {
    return this.payments.simulateSuccess(request.user.id, applicationId, idempotencyKey);
  }

  @Post("by-application/:applicationId/simulate-failure")
  simulateFailure(
    @Req() request: AuthenticatedRequest,
    @Param("applicationId") applicationId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(emptyCommandPipe) _body: Record<string, never>
  ) {
    return this.payments.simulateFailure(request.user.id, applicationId, idempotencyKey);
  }
}

@UseGuards(AuthGuard)
@Controller("demo-held-funds")
export class DemoHeldFundsController {
  constructor(@Inject(DemoPaymentsService) private readonly payments: DemoPaymentsService) {}

  @Post(":id/confirm-move-in")
  confirmMoveIn(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(emptyCommandPipe) _body: Record<string, never>
  ) {
    return this.payments.confirmMoveIn(request.user.id, id, idempotencyKey);
  }
}
