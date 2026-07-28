import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TripsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll() {
    const records = await this.prisma.booking.findMany({
      orderBy: { createdAt: "desc" }
    });

    return records;
  }
}
