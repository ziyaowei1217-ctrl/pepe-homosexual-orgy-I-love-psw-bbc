import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealRoomsController } from "./deal-rooms.controller";
import { DealRoomsService } from "./deal-rooms.service";

@Module({
  imports: [AuthModule],
  controllers: [DealRoomsController],
  providers: [DealRoomsService],
  exports: [DealRoomsService]
})
export class DealRoomsModule {}
