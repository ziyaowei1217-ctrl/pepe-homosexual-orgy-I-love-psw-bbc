import { Module } from "@nestjs/common";

import { DealRoomsController } from "./deal-rooms.controller";
import { DealRoomsService } from "./deal-rooms.service";

@Module({
  controllers: [DealRoomsController],
  providers: [DealRoomsService],
  exports: [DealRoomsService]
})
export class DealRoomsModule {}
