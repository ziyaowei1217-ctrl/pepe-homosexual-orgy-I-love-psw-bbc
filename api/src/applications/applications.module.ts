import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DemoPaymentsModule } from "../demo-payments/demo-payments.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";

@Module({
  imports: [AuthModule, PrismaModule, DemoPaymentsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService]
})
export class ApplicationsModule {}
