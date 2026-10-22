import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, AuthenticatedRequest } from "../auth/auth.guard";
import { OptionalAuthGuard } from "../auth/optional-auth.guard";
import { RoommateActionDto, RoommateDeckQueryDto } from "./dto";
import { RoommatesService } from "./roommates.service";

const deckQueryPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: RoommateDeckQueryDto
});

@Controller("roommates")
export class RoommatesController {
  constructor(@Inject(RoommatesService) private readonly roommates: RoommatesService) {}

  @UseGuards(OptionalAuthGuard)
  @Get("deck")
  findDeck(@Query(deckQueryPipe) query: RoommateDeckQueryDto, @Req() request: Partial<AuthenticatedRequest>) {
    return this.roommates.findDeck(query.limit, request.user?.id);
  }

  @UseGuards(OptionalAuthGuard)
  @Get("deck/:candidateId")
  findDeckCandidate(
    @Param("candidateId") candidateId: string,
    @Req() request: Partial<AuthenticatedRequest>
  ) {
    return this.roommates.findDeckCandidate(candidateId, request.user?.id);
  }

  @UseGuards(AuthGuard)
  @Get("activity")
  findActivity(@Req() request: AuthenticatedRequest) {
    return this.roommates.findActivity(request.user.id);
  }

  @Get()
  findAll() {
    return this.roommates.findAll();
  }

  @UseGuards(AuthGuard)
  @Post("actions/undo")
  @HttpCode(200)
  undoLastAction(@Req() request: AuthenticatedRequest) {
    return this.roommates.undoLastAction(request.user.id);
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
