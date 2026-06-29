import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { RejectListingDto } from "./dto";
import { ListingsService } from "./listings.service";

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
  reject(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() dto: RejectListingDto) {
    return this.listings.reject(id, request.user.id, dto.reason);
  }
}
