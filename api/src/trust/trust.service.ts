import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TrustService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async queues() {
    const records = await this.prisma.trustQueueItem.findMany({
      orderBy: { updatedAt: "desc" }
    });

    return records;
  }
}
