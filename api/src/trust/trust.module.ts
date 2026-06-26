import { Module } from "@nestjs/common";

import { TrustController } from "./trust.controller";

@Module({
  controllers: [TrustController]
})
export class TrustModule {}
