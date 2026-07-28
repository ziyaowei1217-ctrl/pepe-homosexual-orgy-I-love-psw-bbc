import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DealRoomsService } from "../deal-rooms/deal-rooms.service";
import { PrismaService } from "../prisma/prisma.service";
import { RoommateActionDtoValue } from "./dto";

@Injectable()
export class RoommatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealRoomsService) private readonly dealRooms: DealRoomsService
  ) {}

  async findAll() {
    const records = await this.prisma.roommateProfile.findMany({
      orderBy: {
        match: "desc"
      }
    });

    return records.map(toPublicRoommate);
  }

  async recordAction(userId: string, roommateProfileId: string, action: RoommateActionDtoValue) {
    const candidate = await this.prisma.roommateProfile.findUnique({
      where: { id: roommateProfileId }
    });
    if (!candidate) throw new NotFoundException("Roommate profile not found");

    return this.dealRooms.recordRoommateAction({
      userId,
      roommateProfileId,
      action,
      createDealRoom: action === "LIKE" && candidate.localReciprocalLike
    });
  }
}

function toPublicRoommate({ localReciprocalLike: _localReciprocalLike, ...roommate }: any) {
  return roommate;
}
