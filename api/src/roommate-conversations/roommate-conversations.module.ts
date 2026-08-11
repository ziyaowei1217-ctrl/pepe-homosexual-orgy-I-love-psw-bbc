import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { AuthModule } from "../auth/auth.module";
import { HealthModule } from "../health/health.module";
import { MessagingInfrastructureHealth } from "../health/messaging-infrastructure-health";
import { ROOMMATE_CONVERSATION_EVENTS } from "./roommate-conversation-events";
import { RoommateConversationGateway } from "./roommate-conversations.gateway";
import { RoommateConversationsController } from "./roommate-conversations.controller";
import { RoommateConversationsService } from "./roommate-conversations.service";
import { createRoommateMessageRateLimiter, RoommateMessageRateLimiter } from "./roommate-message-rate-limit";

@Module({
  imports: [AuthModule, HealthModule],
  controllers: [RoommateConversationsController],
  providers: [
    RoommateConversationsService,
    RoommateConversationGateway,
    { provide: ROOMMATE_CONVERSATION_EVENTS, useExisting: RoommateConversationGateway },
    {
      provide: RoommateMessageRateLimiter,
      inject: [ConfigService, MessagingInfrastructureHealth],
      useFactory: (config: ConfigService, health: MessagingInfrastructureHealth) =>
        createRoommateMessageRateLimiter({ valkeyUrl: config.get<string>("VALKEY_URL"), health })
    }
  ],
  exports: [RoommateConversationsService, ROOMMATE_CONVERSATION_EVENTS]
})
export class RoommateConversationsModule {}
