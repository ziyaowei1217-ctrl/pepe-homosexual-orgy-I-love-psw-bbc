import { Controller, Get } from "@nestjs/common";

import { seedTrips } from "../seed-data";

@Controller("trips")
export class TripsController {
  @Get()
  findAll() {
    return seedTrips;
  }
}
