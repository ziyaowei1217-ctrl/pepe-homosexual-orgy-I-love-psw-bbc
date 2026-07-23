import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { OptionalAuthGuard } from "../auth/optional-auth.guard";
import { RoommateActionDto, RoommateDeckQueryDto } from "./dto";
import { RoommatesService } from "./roommates.service";

@Controller("roommates")
export class RoommatesController {
  constructor(@Inject(RoommatesService) private readonly roommates: RoommatesService) {}

  @UseGuards(OptionalAuthGuard)
  @Get("deck")
  findDeck(@Query() query: RoommateDeckQueryDto, @Req() request: Partial<AuthenticatedRequest>) {
    return this.roommates.findDeck(query, request.user?.id);
  }

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
