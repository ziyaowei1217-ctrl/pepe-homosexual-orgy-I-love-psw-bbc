import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DealRoomsService } from "../deal-rooms/deal-rooms.service";
import { PrismaService } from "../prisma/prisma.service";
import { seedRoommates } from "../seed-data";
import { CreateRoommateProfileDto, RoommateActionDtoValue, UpdateRoommateProfileDto } from "./dto";
import { buildRoommateCard, buildRoommateDeck, inboundLikeDays, lookbackDays, toPublicRoommate } from "./matching";
import { normalizeUserPair, RoommateMatchService } from "./roommate-match.service";

const withMatchingProfile = { matchingProfile: true } as const;

@Injectable()
export class RoommatesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealRoomsService) private readonly dealRooms: DealRoomsService,
    @Inject(RoommateMatchService) private readonly roommateMatches?: RoommateMatchService
  ) {}

  async findAll() {
    const records = await this.prisma.roommateProfile.findMany({ where: discoverableWhere(), orderBy: { match: "desc" } });

    return records.map(toPublicRoommate);
  }

  async findDeck(limit = 20, userId?: string, now = new Date()) {
    const since = (days: number) => new Date(now.getTime() - days * 86_400_000);
    const [cards, viewer, actions, likers, inboundLikes, lastActions, history] = await Promise.all([
      this.prisma.roommateProfile.findMany({ where: discoverableWhere(), include: withMatchingProfile }),
      userId ? this.prisma.roommateProfile.findUnique({ where: { ownerId: userId }, include: withMatchingProfile }) : null,
      userId
        ? this.prisma.roommateAction.findMany({ where: { userId }, select: { roommateProfileId: true, action: true, updatedAt: true } })
        : [],
      userId
        ? this.prisma.roommateAction.findMany({ where: { action: "LIKE", roommateProfile: { ownerId: userId } }, select: { userId: true } })
        : [],
      this.prisma.roommateAction.groupBy({
        by: ["roommateProfileId"],
        where: { action: "LIKE", updatedAt: { gte: since(inboundLikeDays) } },
        _count: { _all: true }
      }),
      this.prisma.roommateAction.groupBy({
        by: ["userId"],
        where: { updatedAt: { gte: since(lookbackDays) } },
        _max: { updatedAt: true }
      }),
      userId
        ? this.prisma.roommateAction.findMany({
            where: { userId, action: { in: ["LIKE", "PASS"] }, updatedAt: { gte: since(lookbackDays) } },
            include: { roommateProfile: { include: withMatchingProfile } },
            orderBy: { updatedAt: "desc" },
            take: 300
          })
        : []
    ]);

    return buildRoommateDeck(
      cards,
      {
        now,
        userId: userId ?? null,
        viewer,
        actions,
        likedBy: new Set(likers.map((like) => like.userId)),
        inboundLikes: new Map(inboundLikes.map((row) => [row.roommateProfileId, row._count._all])),
        lastActionAt: new Map(lastActions.flatMap((row) => (row._max.updatedAt ? [[row.userId, row._max.updatedAt]] : []))),
        history
      },
      limit
    );
  }

  async findDeckCandidate(candidateId: string, userId?: string) {
    const [card, viewer, ownAction] = await Promise.all([
      this.prisma.roommateProfile.findFirst({ where: { id: candidateId, ...discoverableWhere() }, include: withMatchingProfile }),
      userId ? this.prisma.roommateProfile.findUnique({ where: { ownerId: userId }, include: withMatchingProfile }) : null,
      userId
        ? this.prisma.roommateAction.findUnique({ where: { userId_roommateProfileId: { userId, roommateProfileId: candidateId } } })
        : null
    ]);
    if (!card || (userId && card.ownerId === userId)) throw new NotFoundException("Roommate candidate not found");

    const peerId = userId ? card.ownerId : null;
    const [likedYou, match] = await Promise.all([
      peerId && viewer
        ? this.prisma.roommateAction.findFirst({ where: { userId: peerId, roommateProfileId: viewer.id, action: "LIKE" }, select: { id: true } })
        : null,
      peerId
        ? this.prisma.roommateMatch.findUnique({
            where: { firstUserId_secondUserId: normalizeUserPair(userId!, peerId) },
            select: { status: true, conversation: { select: { id: true } } }
          })
        : null
    ]);

    return buildRoommateCard(card, viewer, {
      likedYou: Boolean(likedYou),
      youLiked: ownAction?.action === "LIKE",
      conversationId: match?.status === "ACTIVE" ? match.conversation?.id ?? null : null
    });
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
      if (action === "LIKE" && candidate.ownerId && candidate.localReciprocalLike && process.env.NODE_ENV !== "production") {
        await this.likeBackForDemo(candidate.ownerId, userId);
      }
      const { action: recorded, match, conversation } = await this.matches().recordAction(userId, roommateProfileId, action);
      return {
        action: recorded,
        match: match && { id: match.id, status: match.status },
        conversation: conversation && { id: conversation.id, matchId: conversation.matchId },
        dealRoom: null
      };
    }

    const result = await this.dealRooms.recordRoommateAction({
      userId,
      roommateProfileId,
      action,
      createDealRoom: false
    });

    return { ...result, match: null, conversation: null };
  }

  undoLastAction(userId: string) {
    return this.matches().undoLastAction(userId);
  }

  /** Development demo cards marked localReciprocalLike like the actor back so the real match path runs. */
  private async likeBackForDemo(demoOwnerId: string, actorUserId: string) {
    const actorCard = await this.prisma.roommateProfile.findUnique({ where: { ownerId: actorUserId }, select: { id: true } });
    if (!actorCard || demoOwnerId === actorUserId) return;
    await this.prisma.roommateAction.upsert({
      where: { userId_roommateProfileId: { userId: demoOwnerId, roommateProfileId: actorCard.id } },
      create: { userId: demoOwnerId, roommateProfileId: actorCard.id, action: "LIKE" },
      update: { action: "LIKE" }
    });
  }

  private matches() {
    if (!this.roommateMatches) throw new Error("Roommate match service is not configured");
    return this.roommateMatches;
  }
}

function discoverableWhere(): Prisma.RoommateProfileWhereInput {
  return {
    status: "active",
    ...(process.env.NODE_ENV === "production" ? { ownerId: { not: null } } : {})
  };
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
