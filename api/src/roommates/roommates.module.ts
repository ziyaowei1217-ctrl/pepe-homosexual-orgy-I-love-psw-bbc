import { Module } from "@nestjs/common";

import { DealRoomsModule } from "../deal-rooms/deal-rooms.module";
import { RoommatesController } from "./roommates.controller";
import { RoommatesService } from "./roommates.service";

@Module({
  imports: [DealRoomsModule],
  controllers: [RoommatesController],
  providers: [RoommatesService]
})
export class RoommatesModule {}
