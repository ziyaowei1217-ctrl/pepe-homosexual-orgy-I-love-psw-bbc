import { Controller, Get, Inject } from "@nestjs/common";

import { TrustService } from "./trust.service";

@Controller("trust")
export class TrustController {
  constructor(@Inject(TrustService) private readonly trust: TrustService) {}

  @Get("queues")
  queues() {
    return this.trust.queues();
  }
}
