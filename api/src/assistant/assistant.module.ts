import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { AssistantController } from "./assistant.controller";

@Module({
  imports: [AuthModule],
  controllers: [AssistantController]
})
export class AssistantModule {}
