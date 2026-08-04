import { Module } from "@nestjs/common";

import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { AdminListingsController } from "./admin-listings.controller";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ListingsController, AdminListingsController],
  providers: [ListingsService],
  exports: [ListingsService]
})
export class ListingsModule {}
