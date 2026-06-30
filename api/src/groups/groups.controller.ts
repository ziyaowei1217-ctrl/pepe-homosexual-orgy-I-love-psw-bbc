import { Controller, Get, Inject } from "@nestjs/common";

import { GroupsService } from "./groups.service";

@Controller("groups")
export class GroupsController {
  constructor(@Inject(GroupsService) private readonly groups: GroupsService) {}

  @Get()
  findAll() {
    return this.groups.findAll();
  }
}
