import { Module } from "@nestjs/common";

import { RoommatesController } from "./roommates.controller";

@Module({
  controllers: [RoommatesController]
})
export class RoommatesModule {}
