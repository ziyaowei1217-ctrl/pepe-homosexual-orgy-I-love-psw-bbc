import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { ROOMMATE_CONVERSATION_EVENTS } from "./roommate-conversation-events";
import { RoommateConversationGateway } from "./roommate-conversations.gateway";
import { RoommateConversationsController } from "./roommate-conversations.controller";
import { RoommateConversationsService } from "./roommate-conversations.service";
import { createRoommateMessageRateLimiter, RoommateMessageRateLimiter } from "./roommate-message-rate-limit";

@Module({
  imports: [AuthModule],
  controllers: [RoommateConversationsController],
  providers: [
    RoommateConversationsService,
    RoommateConversationGateway,
    { provide: ROOMMATE_CONVERSATION_EVENTS, useExisting: RoommateConversationGateway },
    { provide: RoommateMessageRateLimiter, useFactory: () => createRoommateMessageRateLimiter() }
  ],
  exports: [RoommateConversationsService, ROOMMATE_CONVERSATION_EVENTS]
})
export class RoommateConversationsModule {}
