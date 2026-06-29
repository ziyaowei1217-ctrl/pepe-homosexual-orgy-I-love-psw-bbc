import { Module } from "@nestjs/common";

import { AdminListingsController } from "./admin-listings.controller";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

@Module({
  controllers: [ListingsController, AdminListingsController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ListingsModule {}
