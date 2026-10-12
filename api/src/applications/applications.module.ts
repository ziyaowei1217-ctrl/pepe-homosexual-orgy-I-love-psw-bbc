import { PaymentMfaGuard } from "../auth/payment-mfa.guard";
import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { DealThreadsModule } from "../deal-threads/deal-threads.module";
import { PaymentCommandsModule } from "../payments/payment-commands.module";
import { PrismaModule } from "../prisma/prisma.module";
import { ApplicationsController } from "./applications.controller";
import { ApplicationsService } from "./applications.service";

@Module({
  imports: [AuthModule, PrismaModule, PaymentCommandsModule, DealThreadsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, PaymentMfaGuard],
  exports: [ApplicationsService]
})
export class ApplicationsModule {}
