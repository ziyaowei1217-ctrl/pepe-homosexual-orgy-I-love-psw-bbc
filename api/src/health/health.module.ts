import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { MessagingInfrastructureHealth } from "./messaging-infrastructure-health";
import { HealthService } from "./health.service";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    { provide: MessagingInfrastructureHealth, useFactory: () => new MessagingInfrastructureHealth() }
  ],
  exports: [MessagingInfrastructureHealth]
})
export class HealthModule {}
