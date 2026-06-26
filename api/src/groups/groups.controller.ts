import { Controller, Get } from "@nestjs/common";

import { seedGroups } from "../seed-data";

@Controller("groups")
export class GroupsController {
  @Get()
  findAll() {
    return seedGroups;
  }
}
