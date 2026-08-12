import { Controller, Get, Inject, UseGuards } from "@nestjs/common";

import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { TrustService } from "./trust.service";

@UseGuards(AuthGuard, AdminGuard)
@Controller("trust")
export class TrustController {
  constructor(@Inject(TrustService) private readonly trust: TrustService) {}

  @Get("queues")
  queues() {
    return this.trust.queues();
  }
}
