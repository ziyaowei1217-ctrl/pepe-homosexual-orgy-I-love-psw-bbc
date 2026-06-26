import { Controller, Get } from "@nestjs/common";

import { seedRoommates } from "../seed-data";

@Controller("roommates")
export class RoommatesController {
  @Get()
  findAll() {
    return seedRoommates;
  }
}
