import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DealRoomsService } from "../deal-rooms/deal-rooms.service";
import { PrismaService } from "../prisma/prisma.service";
import { seedRoommates } from "../seed-data";
import {
  CreateRoommateProfileDto,
  RoommateActionDtoValue,
  RoommateDeckQueryDto,
  UpdateRoommateProfileDto
} from "./dto";
import { buildRoommateDeck, getActionFeedback } from "./matching";

@Injectable()
export class RoommatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealRoomsService) private readonly dealRooms: DealRoomsService
  ) {}

  async findAll() {
    const records = await this.prisma.roommateProfile.findMany({
      where: {
        status: "active"
      },
      orderBy: {
        match: "desc"
      }
    });

    return records.length > 0 ? records : seedRoommates;
  }

  async findDeck(query: RoommateDeckQueryDto, userId?: string) {
    const profiles = await this.findAll();
    const excludedRoommateProfileIds = userId ? await this.findUserActionRoommateProfileIds(userId) : new Set<string>();
    const eligibleProfiles = profiles.filter((profile) => !profile.id || !excludedRoommateProfileIds.has(profile.id));

    if (eligibleProfiles.length === 0) {
      return buildRoommateDeck([], query);
    }

    return buildRoommateDeck(eligibleProfiles, query);
  }

  async findAdminProfiles() {
    const records = await this.prisma.roommateProfile.findMany({
      orderBy: [
        {
          match: "desc"
        },
        {
          createdAt: "desc"
        }
      ]
    });

    return records.length > 0 ? records : seedRoommates;
  }

  createAdminProfile(dto: CreateRoommateProfileDto) {
    return this.prisma.roommateProfile.create({
      data: toRoommateProfileCreateData(dto)
    });
  }

  async updateAdminProfile(id: string, dto: UpdateRoommateProfileDto) {
    const existing = await this.prisma.roommateProfile.findUnique({ where: { id } });

    if (existing) {
      return this.prisma.roommateProfile.update({
        where: { id },
        data: toRoommateProfileUpdateData(dto)
      });
    }

    const seeded = seedRoommates.find((roommate) => roommate.id === id);
    if (!seeded) throw new NotFoundException("Roommate profile not found");

    return this.prisma.roommateProfile.create({
      data: {
        ...seeded,
        ...toRoommateProfileUpdateData(dto),
        id: seeded.id
      }
    });
  }

  async recordAction(userId: string, roommateProfileId: string, action: RoommateActionDtoValue) {
    const result = await this.dealRooms.recordRoommateAction({
      userId,
      roommateProfileId,
      action
    });

    const snapshot = result.dealRoom?.members?.[0]?.snapshot as { name?: string } | undefined;
    return {
      ...result,
      feedback: getActionFeedback(action, snapshot?.name ?? "this roommate")
    };
  }

  private async findUserActionRoommateProfileIds(userId: string) {
    const actions = await this.prisma.roommateAction.findMany({
      where: { userId },
      select: { roommateProfileId: true }
    });

    return new Set(actions.map((action) => action.roommateProfileId));
  }
}

function toRoommateProfileCreateData(dto: CreateRoommateProfileDto) {
  return {
    name: dto.name,
    age: dto.age,
    role: dto.role,
    image: dto.image,
    match: dto.match,
    budget: dto.budget,
    commute: dto.commute,
    tags: dto.tags,
    status: "active",
    archivedAt: null
  };
}

function toRoommateProfileUpdateData(dto: UpdateRoommateProfileDto) {
  const statusFields = getRoommateProfileStatusFields(dto.status);

  return {
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.age !== undefined ? { age: dto.age } : {}),
    ...(dto.role !== undefined ? { role: dto.role } : {}),
    ...(dto.image !== undefined ? { image: dto.image } : {}),
    ...(dto.match !== undefined ? { match: dto.match } : {}),
    ...(dto.budget !== undefined ? { budget: dto.budget } : {}),
    ...(dto.commute !== undefined ? { commute: dto.commute } : {}),
    ...(dto.tags !== undefined ? { tags: dto.tags } : {}),
    ...statusFields
  };
}

function getRoommateProfileStatusFields(status?: string) {
  if (status === "hidden") {
    return {
      status,
      archivedAt: new Date()
    };
  }

  if (status === "active") {
    return {
      status,
      archivedAt: null
    };
  }

  return {};
}
