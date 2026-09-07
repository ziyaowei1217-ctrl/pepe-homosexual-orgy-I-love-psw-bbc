import { Module } from "@nestjs/common";

import { DemoPaymentsService } from "../demo-payments/demo-payments.service";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { createPaymentCommands, PAYMENT_COMMANDS } from "./payment-commands";
import { PaymentOperationsService } from "./payment-operations.service";

@Module({
  imports: [PrismaModule],
  providers: [PaymentOperationsService, {
    provide: PAYMENT_COMMANDS,
    inject: [PrismaService],
    useFactory: (prisma: PrismaService) => createPaymentCommands({
      developmentCommands: new DemoPaymentsService(prisma)
    })
  }],
  exports: [PAYMENT_COMMANDS, PaymentOperationsService]
})
export class PaymentCommandsModule {}
