import { Module } from "@nestjs/common";

import { DealThreadsController } from "./deal-threads.controller";
import { DealThreadsService } from "./deal-threads.service";

@Module({
  controllers: [DealThreadsController],
  providers: [DealThreadsService],
  exports: [DealThreadsService]
})
export class DealThreadsModule {}
