import { Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { DealRoomsService } from "./deal-rooms.service";

@UseGuards(AuthGuard)
@Controller("deal-rooms")
export class DealRoomsController {
  constructor(private readonly dealRooms: DealRoomsService) {}

  @Get("active")
  active(@Req() request: AuthenticatedRequest) {
    return this.dealRooms.findActiveForUser(request.user.id);
  }

  @Post(":id/tour-requests")
  requestTour(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.dealRooms.requestGroupTour(request.user.id, id);
  }
}
