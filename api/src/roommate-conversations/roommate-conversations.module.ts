import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import {
  NoopRoommateConversationEvents,
  ROOMMATE_CONVERSATION_EVENTS
} from "./roommate-conversation-events";
import { RoommateConversationsController } from "./roommate-conversations.controller";
import { RoommateConversationsService } from "./roommate-conversations.service";
import { LocalRoommateMessageRateLimiter, RoommateMessageRateLimiter } from "./roommate-message-rate-limit";

@Module({
  imports: [AuthModule],
  controllers: [RoommateConversationsController],
  providers: [
    RoommateConversationsService,
    { provide: ROOMMATE_CONVERSATION_EVENTS, useClass: NoopRoommateConversationEvents },
    { provide: RoommateMessageRateLimiter, useFactory: () => new LocalRoommateMessageRateLimiter() }
  ],
  exports: [RoommateConversationsService, ROOMMATE_CONVERSATION_EVENTS]
})
export class RoommateConversationsModule {}

