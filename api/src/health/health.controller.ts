import { Controller, Get, Inject } from "@nestjs/common";

import { HealthService } from "./health.service";

@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get("health")
  health() {
    return this.healthService.health();
  }

  @Get("ready")
  ready() {
    return this.healthService.ready();
  }
}
