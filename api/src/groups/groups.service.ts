import { Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";
import { seedGroups } from "../seed-data";

@Injectable()
export class GroupsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll() {
    const records = await this.prisma.group.findMany({
      orderBy: { createdAt: "desc" }
    });

    return records.length > 0 ? records : seedGroups;
  }
}
