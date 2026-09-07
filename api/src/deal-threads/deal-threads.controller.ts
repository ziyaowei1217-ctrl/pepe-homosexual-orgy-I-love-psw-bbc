import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { CreateDealThreadDto, CreateViewingRequestDto, DecideViewingRequestDto, SendDealMessageDto } from "./dto";
import { DealThreadsService } from "./deal-threads.service";

const createThreadBodyPipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
  expectedType: CreateDealThreadDto
});

const sendMessageBodyPipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
  expectedType: SendDealMessageDto
});

const createViewingBodyPipe = new ValidationPipe({
  forbidNonWhitelisted: true,
  transform: true,
  whitelist: true,
  expectedType: CreateViewingRequestDto
});

const decideViewingBodyPipe = new ValidationPipe({
  forbidNonWhitelisted: true, transform: true, whitelist: true, expectedType: DecideViewingRequestDto
});

@UseGuards(AuthGuard)
@Controller("deal-threads")
export class DealThreadsController {
  constructor(@Inject(DealThreadsService) private readonly dealThreads: DealThreadsService) {}

  @Get()
  findMine(@Req() request: AuthenticatedRequest) {
    return this.dealThreads.findForUser(request.user.id);
  }

  @Post()
  createOrFind(@Req() request: AuthenticatedRequest, @Body(createThreadBodyPipe) dto: CreateDealThreadDto) {
    return this.dealThreads.createOrFindThread(request.user.id, dto);
  }

  @Post(":id/messages")
  sendMessage(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(sendMessageBodyPipe) dto: SendDealMessageDto
  ) {
    return this.dealThreads.sendMessage(request.user.id, id, dto);
  }

  @Post(":id/viewing-requests")
  createViewingRequest(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body(createViewingBodyPipe) dto: CreateViewingRequestDto
  ) {
    return this.dealThreads.createViewingRequest(request.user.id, id, dto);
  }

  @Post(":threadId/viewing-requests/:requestId/confirm")
  confirmViewingRequest(
    @Req() request: AuthenticatedRequest,
    @Param("threadId") threadId: string,
    @Param("requestId") requestId: string,
    @Body(decideViewingBodyPipe) dto: DecideViewingRequestDto
  ) {
    return this.dealThreads.confirmViewingRequest(request.user.id, threadId, requestId, dto.expectedRevision);
  }

  @Post(":threadId/viewing-requests/:requestId/decline")
  declineViewingRequest(
    @Req() request: AuthenticatedRequest,
    @Param("threadId") threadId: string,
    @Param("requestId") requestId: string,
    @Body(decideViewingBodyPipe) dto: DecideViewingRequestDto
  ) {
    return this.dealThreads.declineViewingRequest(request.user.id, threadId, requestId, dto.expectedRevision);
  }
}
