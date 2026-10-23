import { GoneException, Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TripsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll() {
    // Legacy bookings have no account ownership. Real stays use authorized applications.
    if (process.env.NODE_ENV === "production") {
      throw new GoneException({ code: "LEGACY_TRIPS_RETIRED", message: "Use your rental applications to view stays" });
    }
    const records = await this.prisma.booking.findMany({
      orderBy: { createdAt: "desc" }
    });

    return records;
  }
}
