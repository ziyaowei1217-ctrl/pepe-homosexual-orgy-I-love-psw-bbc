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
import { buildRankedRoommateCandidates, buildRoommateDeck, getActionFeedback, toPublicRoommate } from "./matching";
import { RoommateMatchService } from "./roommate-match.service";

import { assertRoommateDiscoveryCapacity, MAX_DISCOVERABLE_ROOMMATE_PROFILES } from "./discovery-capacity";
export { MAX_DISCOVERABLE_ROOMMATE_PROFILES } from "./discovery-capacity";

@Injectable()
export class RoommatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealRoomsService) private readonly dealRooms: DealRoomsService,
    @Inject(RoommateMatchService) private readonly roommateMatches?: RoommateMatchService
  ) {}

  async findAll() {
    const records = await this.findDiscoverableProfiles();

    return records.map(toPublicRoommate);
  }

  async findDeck(query: RoommateDeckQueryDto, userId?: string) {
    const profiles = await this.findDiscoverableProfiles();
    const excludedRoommateProfileIds = userId ? await this.findUserActionRoommateProfileIds(userId, profiles.map(profile => profile.id)) : new Set<string>();
    const eligibleProfiles = profiles.filter(
      (profile) =>
        (!userId || profile.ownerId !== userId) &&
        (!profile.id || !excludedRoommateProfileIds.has(profile.id))
    );

    if (eligibleProfiles.length === 0) {
      return buildRoommateDeck([], query);
    }

    return buildRoommateDeck(eligibleProfiles, query);
  }

  async findDeckCandidate(candidateId: string, userId?: string) {
    // Development cards may be synthetic variants of an existing seed profile.
    // Production has only owned, direct profile IDs.
    const sourceId = process.env.NODE_ENV !== "production"
      ? /^deck-(.+)-[1-9][0-9]*$/.exec(candidateId)?.[1] ?? candidateId : candidateId;
    const source = await this.prisma.roommateProfile.findUnique({ where: { id: sourceId } });
    if (!source || source.status !== "active" || source.archivedAt ||
        (process.env.NODE_ENV === "production" && !source.ownerId) ||
        (userId && source.ownerId === userId)) throw new NotFoundException("Roommate candidate not found");
    if (userId && await this.prisma.roommateAction.findUnique({
      where: { userId_roommateProfileId: { userId, roommateProfileId: sourceId } }, select: { id: true }
    })) throw new NotFoundException("Roommate candidate not found");
    const profiles = await this.findDiscoverableProfiles();
    const excludedRoommateProfileIds = userId ? await this.findUserActionRoommateProfileIds(userId, profiles.map(profile => profile.id)) : new Set<string>();
    const eligibleProfiles = profiles.filter(
      (profile) =>
        (!userId || profile.ownerId !== userId) &&
        (!profile.id || !excludedRoommateProfileIds.has(profile.id))
    );
    const candidate = buildRankedRoommateCandidates(eligibleProfiles).find(item => item.id === candidateId);
    if (candidate) return candidate;
    throw new NotFoundException("Roommate candidate not found");
  }

  async findActivity(userId: string) {
    const ownProfile = await this.prisma.roommateProfile.findUnique({ where: { ownerId: userId } });
    const [outboundActions, inboundActions] = await Promise.all([
      this.prisma.roommateAction.findMany({
        where: { userId, action: "LIKE" },
        include: { roommateProfile: true },
        orderBy: { updatedAt: "desc" }
      }),
      ownProfile
        ? this.prisma.roommateAction.findMany({
            where: { roommateProfileId: ownProfile.id, action: "LIKE" },
            include: { user: { include: { roommateProfile: true } } },
            orderBy: { updatedAt: "desc" }
          })
        : Promise.resolve([])
    ]);

    const outbound = outboundActions.map((item) => ({
      action: item.action,
      profile: toPublicRoommate(item.roommateProfile)
    }));
    const inbound = inboundActions.flatMap((item) => item.user.roommateProfile
      ? [{ action: item.action, profile: toPublicRoommate(item.user.roommateProfile) }]
      : []);
    const inboundIds = new Set(inbound.map((item) => item.profile.id));

    return {
      inbound,
      outbound,
      matchedProfileIds: outbound.map((item) => item.profile.id).filter((id) => inboundIds.has(id))
    };
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
    const candidate = await this.prisma.roommateProfile.findUnique({
      where: { id: roommateProfileId }
    });
    if (!candidate) throw new NotFoundException("Roommate profile not found");

    if (candidate.ownerId || process.env.NODE_ENV === "production") {
      if (!this.roommateMatches) throw new Error("Roommate match service is not configured");
      const result = await this.roommateMatches.recordAction(userId, roommateProfileId, action);
      return {
        ...result,
        dealRoom: null,
        feedback: getActionFeedback(action, candidate.name)
      };
    }

    const result = await this.dealRooms.recordRoommateAction({
      userId,
      roommateProfileId,
      action,
      createDealRoom: false
    });

    return {
      ...result,
      feedback: getActionFeedback(action, candidate.name)
    };
  }

  private async findUserActionRoommateProfileIds(userId: string, profileIds: string[]) {
    const actions = await this.prisma.roommateAction.findMany({
      where: { userId, roommateProfileId: { in: profileIds } },
      select: { roommateProfileId: true },
      take: MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1
    });

    return new Set(actions.map((action) => action.roommateProfileId));
  }

  private async findDiscoverableProfiles() {
    const profiles = await this.prisma.roommateProfile.findMany({
      where: {
        status: "active",
        archivedAt: null,
        ...(process.env.NODE_ENV === "production" ? { ownerId: { not: null } } : {})
      },
      orderBy: [{ match: "desc" }, { id: "asc" }],
      take: MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1
    });
    assertRoommateDiscoveryCapacity(profiles.length);
    return profiles;
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
