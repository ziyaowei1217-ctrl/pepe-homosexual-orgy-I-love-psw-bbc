import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealRoomsModule } from "../deal-rooms/deal-rooms.module";
import { AdminRoommatesController } from "./admin-roommates.controller";
import { RoommatesController } from "./roommates.controller";
import { RoommatesService } from "./roommates.service";

@Module({
  imports: [AuthModule, DealRoomsModule],
  controllers: [RoommatesController, AdminRoommatesController],
  providers: [RoommatesService]
})
export class RoommatesModule {}
