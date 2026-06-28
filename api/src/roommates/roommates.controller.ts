import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { RoommateActionDto } from "./dto";
import { RoommatesService } from "./roommates.service";

@Controller("roommates")
export class RoommatesController {
  constructor(private readonly roommates: RoommatesService) {}

  @Get()
  findAll() {
    return this.roommates.findAll();
  }

  @UseGuards(AuthGuard)
  @Post(":id/actions")
  recordAction(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RoommateActionDto
  ) {
    return this.roommates.recordAction(request.user.id, id, dto.action);
  }
}
