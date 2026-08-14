import { Body, Controller, Get, Headers, Inject, Param, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { ApplicationDecisionDto, CancelRentalApplicationDto, CreateRentalApplicationDto } from "./applications.dto";
import { ApplicationsService } from "./applications.service";

const createBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateRentalApplicationDto
});

const decisionBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: ApplicationDecisionDto
});

const cancellationBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CancelRentalApplicationDto
});

@UseGuards(AuthGuard)
@Controller("applications")
export class ApplicationsController {
  constructor(@Inject(ApplicationsService) private readonly applications: ApplicationsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(createBodyPipe) dto: CreateRentalApplicationDto
  ) {
    return this.applications.create(request.user.id, idempotencyKey, dto);
  }

  @Get("mine")
  mine(@Req() request: AuthenticatedRequest) {
    return this.applications.mine(request.user.id);
  }

  @Get("host-inbox")
  hostInbox(@Req() request: AuthenticatedRequest) {
    return this.applications.hostInbox(request.user.id);
  }

  @Get(":id")
  findOne(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.applications.findOne(request.user.id, id);
  }

  @Post(":id/submit")
  submit(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ) {
    return this.applications.submit(request.user.id, id, idempotencyKey);
  }

  @Post(":id/withdraw")
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined
  ) {
    return this.applications.withdraw(request.user.id, id, idempotencyKey);
  }

  @Post(":id/accept")
  accept(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(decisionBodyPipe) dto: ApplicationDecisionDto
  ) {
    return this.applications.accept(request.user.id, id, idempotencyKey, dto);
  }

  @Post(":id/reject")
  reject(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(decisionBodyPipe) dto: ApplicationDecisionDto
  ) {
    return this.applications.reject(request.user.id, id, idempotencyKey, dto);
  }

  @Post(":id/cancel")
  cancel(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body(cancellationBodyPipe) dto: CancelRentalApplicationDto
  ) {
    return this.applications.cancel(request.user.id, id, idempotencyKey, dto);
  }
}
