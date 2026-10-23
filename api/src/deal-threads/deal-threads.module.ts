import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { RoommateConversationsModule } from "../roommate-conversations/roommate-conversations.module";
import { DealThreadsController } from "./deal-threads.controller";
import { DealThreadsService } from "./deal-threads.service";

@Module({
  imports: [AuthModule, RoommateConversationsModule],
  controllers: [DealThreadsController],
  providers: [DealThreadsService],
  exports: [DealThreadsService]
})
export class DealThreadsModule {}
