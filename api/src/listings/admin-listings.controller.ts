import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
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
  approve(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.listings.approve(id, request.user.id);
  }

  @Post(":id/reject")
  reject(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body(rejectListingBodyPipe) dto: RejectListingDto) {
    return this.listings.reject(id, request.user.id, dto.reason);
  }
}
