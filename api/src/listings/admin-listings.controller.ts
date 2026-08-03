import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuditActor } from "../audit/audit.service";
import { AdminGuard } from "../auth/admin.guard";
import { AdminStepUpGuard } from "../auth/admin-step-up.guard";
import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { RequestWithId } from "../http/request-id";
import { RejectListingDto } from "./dto";
import { ListingsService } from "./listings.service";

const rejectListingBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: RejectListingDto
});

@UseGuards(AuthGuard, AdminGuard)
@Controller("admin/listings")
export class AdminListingsController {
  constructor(@Inject(ListingsService) private readonly listings: ListingsService) {}

  @Get("review-queue")
  findReviewQueue() {
    return this.listings.findReviewQueue();
  }

  @Post(":id/approve")
  @UseGuards(AdminStepUpGuard)
  approve(@Req() request: AuthenticatedRequest & RequestWithId, @Param("id") id: string) {
    return this.listings.approve(id, requestAuditActor(request));
  }

  @Post(":id/reject")
  @UseGuards(AdminStepUpGuard)
  reject(
    @Req() request: AuthenticatedRequest & RequestWithId,
    @Param("id") id: string,
    @Body(rejectListingBodyPipe) dto: RejectListingDto
  ) {
    return this.listings.reject(id, requestAuditActor(request), dto.reason);
  }
}

function requestAuditActor(request: AuthenticatedRequest & RequestWithId): AuditActor {
  return {
    actorType: "USER",
    actorUserId: request.user.id,
    actorEmail: request.user.email,
    requestId: request.requestId
  };
}
