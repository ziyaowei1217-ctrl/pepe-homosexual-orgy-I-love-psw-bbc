import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { HousingListingsController, ProfilesController, RoommateProfilesController } from "./marketplace.controller";
import { MarketplaceService } from "./marketplace.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ProfilesController, RoommateProfilesController, HousingListingsController],
  providers: [MarketplaceService]
})
export class MarketplaceModule {}
