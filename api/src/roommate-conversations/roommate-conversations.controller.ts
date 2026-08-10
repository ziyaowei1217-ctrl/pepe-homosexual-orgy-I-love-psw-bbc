import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";

import { AuthGuard, type AuthenticatedRequest } from "../auth/auth.guard";
import {
  MarkRoommateConversationReadDto,
  RoommateMessagePageQueryDto,
  SendRoommateMessageDto
} from "./dto";
import { RoommateConversationsService } from "./roommate-conversations.service";

@UseGuards(AuthGuard)
@Controller("roommate-conversations")
export class RoommateConversationsController {
  constructor(@Inject(RoommateConversationsService) private readonly conversations: RoommateConversationsService) {}

  @Get()
  listMine(@Req() request: AuthenticatedRequest) {
    return this.conversations.listForUser(request.user.id);
  }

  @Get(":id/messages")
  listMessages(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Query() query: RoommateMessagePageQueryDto
  ) {
    return this.conversations.listMessages(request.user.id, id, query);
  }

  @Post(":id/messages")
  send(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: SendRoommateMessageDto
  ) {
    return this.conversations.sendMessage(request.user.id, id, dto);
  }

  @Post(":id/read")
  markRead(
    @Req() request: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: MarkRoommateConversationReadDto
  ) {
    return this.conversations.markRead(request.user.id, id, dto);
  }
}

