import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards, ValidationPipe } from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import { CreateRoommateTeamInviteDto } from "./roommate-teams.dto";
import { RoommateTeamsService } from "./roommate-teams.service";

const createInviteBodyPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  expectedType: CreateRoommateTeamInviteDto
});

@UseGuards(AuthGuard)
@Controller("roommate-teams")
export class RoommateTeamsController {
  constructor(@Inject(RoommateTeamsService) private readonly teams: RoommateTeamsService) {}

  @Get("current")
  current(@Req() request: AuthenticatedRequest) {
    return this.teams.current(request.user.id);
  }

  @Get("invites")
  listInvites(@Req() request: AuthenticatedRequest) {
    return this.teams.listInvites(request.user.id);
  }

  @Post("invites")
  invite(@Req() request: AuthenticatedRequest, @Body(createInviteBodyPipe) dto: CreateRoommateTeamInviteDto) {
    return this.teams.invite(request.user.id, dto);
  }

  @Post("invites/:id/accept")
  accept(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.teams.accept(request.user.id, id);
  }

  @Post("invites/:id/decline")
  decline(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.teams.decline(request.user.id, id);
  }

  @Post("invites/:id/cancel")
  cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    return this.teams.cancel(request.user.id, id);
  }

  @Post("current/leave")
  leave(@Req() request: AuthenticatedRequest) {
    return this.teams.leave(request.user.id);
  }
}
