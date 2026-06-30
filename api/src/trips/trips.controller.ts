import { Controller, Get, Inject } from "@nestjs/common";

import { TripsService } from "./trips.service";

@Controller("trips")
export class TripsController {
  constructor(@Inject(TripsService) private readonly trips: TripsService) {}

  @Get()
  findAll() {
    return this.trips.findAll();
  }
}
