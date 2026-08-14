import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DemoHeldFundsController, DemoPaymentsController } from "./demo-payments.controller";
import { DemoPaymentsService } from "./demo-payments.service";

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DemoPaymentsController, DemoHeldFundsController],
  providers: [DemoPaymentsService],
  exports: [DemoPaymentsService]
})
export class DemoPaymentsModule {}
