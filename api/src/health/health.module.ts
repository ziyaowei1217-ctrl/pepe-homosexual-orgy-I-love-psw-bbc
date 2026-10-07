import { Module } from "@nestjs/common";

import { HealthController } from "./health.controller";
import { AuthInfrastructureHealth } from "./auth-infrastructure-health";
import { MessagingInfrastructureHealth } from "./messaging-infrastructure-health";
import { HealthService } from "./health.service";

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    AuthInfrastructureHealth,
    { provide: MessagingInfrastructureHealth, useFactory: () => new MessagingInfrastructureHealth() }
  ],
  exports: [MessagingInfrastructureHealth, AuthInfrastructureHealth]
})
export class HealthModule {}
