import { GoneException, Inject, Injectable } from "@nestjs/common";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class GroupsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findAll() {
    // Legacy group JSON cannot establish membership; real teams enforce authenticated membership.
    if (process.env.NODE_ENV === "production") {
      throw new GoneException({ code: "LEGACY_GROUPS_RETIRED", message: "Use your roommate teams to view groups" });
    }
    const records = await this.prisma.group.findMany({
      orderBy: { createdAt: "desc" }
    });

    return records;
  }
}
