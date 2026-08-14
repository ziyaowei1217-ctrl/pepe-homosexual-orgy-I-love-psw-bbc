import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealRoomsModule } from "../deal-rooms/deal-rooms.module";
import { RoommateTeamsController } from "./roommate-teams.controller";
import { RoommateTeamsService } from "./roommate-teams.service";

@Module({
  imports: [AuthModule, DealRoomsModule],
  controllers: [RoommateTeamsController],
  providers: [RoommateTeamsService],
  exports: [RoommateTeamsService]
})
export class RoommateTeamsModule {}
