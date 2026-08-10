import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealThreadsController } from "./deal-threads.controller";
import { DealThreadsService } from "./deal-threads.service";

@Module({
  imports: [AuthModule],
  controllers: [DealThreadsController],
  providers: [DealThreadsService],
  exports: [DealThreadsService]
})
export class DealThreadsModule {}
