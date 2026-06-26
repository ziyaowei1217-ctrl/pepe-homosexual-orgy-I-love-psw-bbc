import { Controller, Get } from "@nestjs/common";

import { seedTrustQueues } from "../seed-data";

@Controller("trust")
export class TrustController {
  @Get("queues")
  queues() {
    return seedTrustQueues;
  }
}
