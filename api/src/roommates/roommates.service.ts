import { Injectable } from "@nestjs/common";

import { DealRoomsService } from "../deal-rooms/deal-rooms.service";
import { PrismaService } from "../prisma/prisma.service";
import { seedRoommates } from "../seed-data";
import { RoommateActionDtoValue } from "./dto";

@Injectable()
export class RoommatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dealRooms: DealRoomsService
  ) {}

  async findAll() {
    const records = await this.prisma.roommateProfile.findMany({
      orderBy: {
        match: "desc"
      }
    });

    return records.length > 0 ? records : seedRoommates;
  }

  recordAction(userId: string, roommateProfileId: string, action: RoommateActionDtoValue) {
    return this.dealRooms.recordRoommateAction({
      userId,
      roommateProfileId,
      action
    });
  }
}
