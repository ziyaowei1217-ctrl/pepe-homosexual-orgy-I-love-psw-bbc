import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DealRoomsService } from "../deal-rooms/deal-rooms.service";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeUserPair } from "../roommates/roommate-match.service";
import type { CreateRoommateTeamInviteDto } from "./roommate-teams.dto";
import { presentRoommateTeam, presentRoommateTeamInvite } from "./roommate-teams.presenter";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SERIALIZABLE_RETRY_LIMIT = 3;

type TransactionClient = Prisma.TransactionClient;

type ConfirmedTeamDealRooms = {
  ensureForConfirmedTeam(
    transaction: TransactionClient,
    ownerId: string,
    teammateId: string
  ): Promise<{ id: string }>;
};

@Injectable()
export class RoommateTeamsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DealRoomsService) private readonly dealRooms: ConfirmedTeamDealRooms
  ) {}

  async current(userId: string) {
    const membership = await this.prisma.roommateTeamMember.findFirst({
      where: {
        userId,
        active: true,
        team: { status: "ACTIVE" }
      },
      include: {
        team: { include: { members: true } }
      }
    });

    return membership?.team ? presentRoommateTeam(membership.team) : null;
  }

  async listInvites(userId: string) {
    await this.expireStaleInvites(this.prisma, new Date());
    const invites = await this.prisma.roommateTeamInvite.findMany({
      where: {
        OR: [{ inviterId: userId }, { inviteeId: userId }]
      },
      orderBy: { createdAt: "desc" }
    });

    return invites.map(presentRoommateTeamInvite);
  }

  async invite(userId: string, dto: CreateRoommateTeamInviteDto) {
    const target = await this.prisma.roommateProfile.findUnique({
      where: { id: dto.roommateProfileId }
    });
    if (!target?.ownerId) throw new NotFoundException("Roommate profile not found");
    if (target.ownerId === userId) throw new ConflictException("不能邀请自己组队");

    const pair = normalizeUserPair(userId, target.ownerId);
    const match = await this.prisma.roommateMatch.findUnique({
      where: { firstUserId_secondUserId: pair }
    });
    if (!match || match.status !== "ACTIVE") {
      throw new ConflictException("双方互相喜欢后才能邀请组队");
    }

    await this.expireStaleInvites(this.prisma, new Date());
    await this.assertUsersAvailable(this.prisma, [userId, target.ownerId]);

    const pending = await this.prisma.roommateTeamInvite.findFirst({
      where: { matchId: match.id, status: "PENDING" }
    });
    if (pending) return presentRoommateTeamInvite(pending);

    try {
      const now = new Date();
      const invite = await this.prisma.roommateTeamInvite.create({
        data: {
          matchId: match.id,
          inviterId: userId,
          inviteeId: target.ownerId,
          expiresAt: new Date(now.getTime() + INVITE_TTL_MS)
        }
      });
      return presentRoommateTeamInvite(invite);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.prisma.roommateTeamInvite.findFirst({
        where: { matchId: match.id, status: "PENDING" }
      });
      if (winner) return presentRoommateTeamInvite(winner);
      throw new ConflictException("组队邀请状态已更新，请刷新后重试");
    }
  }

  async accept(userId: string, inviteId: string) {
    return this.withSerializableRetry(async (transaction) => {
      const now = new Date();
      await this.expireStaleInvites(transaction, now);
      const invite = await transaction.roommateTeamInvite.findUnique({ where: { id: inviteId } });
      this.assertInviteParticipant(invite, userId, "inviteeId");

      if (invite.status === "ACCEPTED" && invite.teamId) {
        return this.findTeamOrThrow(transaction, invite.teamId);
      }
      if (invite.status !== "PENDING") {
        throw new ConflictException("组队邀请已不可接受");
      }

      await this.assertUsersAvailable(transaction, [invite.inviterId, invite.inviteeId]);
      const profiles = await transaction.roommateProfile.findMany({
        where: { ownerId: { in: [invite.inviterId, invite.inviteeId] } }
      });
      const profilesByOwner = new Map(profiles.map((profile) => [profile.ownerId, profile]));
      if (!profilesByOwner.has(invite.inviterId) || !profilesByOwner.has(invite.inviteeId)) {
        throw new ConflictException("组队成员资料已不可用");
      }

      const dealRoom = await this.dealRooms.ensureForConfirmedTeam(
        transaction,
        invite.inviterId,
        invite.inviteeId
      );
      const team = await transaction.roommateTeam.create({
        data: { dealRoomId: dealRoom.id }
      });
      await transaction.roommateTeamMember.createMany({
        data: [invite.inviterId, invite.inviteeId].map((memberId) => ({
          teamId: team.id,
          userId: memberId,
          snapshot: toMemberSnapshot(profilesByOwner.get(memberId)!),
          active: true,
          joinedAt: now,
          leftAt: null
        }))
      });
      await transaction.roommateTeamInvite.update({
        where: { id: invite.id },
        data: {
          status: "ACCEPTED",
          teamId: team.id,
          respondedAt: now
        }
      });

      return this.findTeamOrThrow(transaction, team.id);
    });
  }

  decline(userId: string, inviteId: string) {
    return this.respondToInvite(userId, inviteId, "inviteeId", "DECLINED");
  }

  cancel(userId: string, inviteId: string) {
    return this.respondToInvite(userId, inviteId, "inviterId", "CANCELLED");
  }

  async leave(userId: string) {
    return this.withSerializableRetry(async (transaction) => {
      const membership = await transaction.roommateTeamMember.findFirst({
        where: {
          userId,
          active: true,
          team: { status: "ACTIVE" }
        },
        include: { team: { include: { members: true } } }
      });
      if (!membership?.team) throw new NotFoundException("Active roommate team not found");

      const now = new Date();
      const dissolved = await transaction.roommateTeam.updateMany({
        where: { id: membership.team.id, status: "ACTIVE" },
        data: {
          status: "DISSOLVED",
          dissolvedAt: now,
          dissolvedById: userId,
          dissolveReason: "成员主动离开"
        }
      });
      if (dissolved.count !== 1) throw new ConflictException("组队状态已更新，请刷新后重试");

      await transaction.roommateTeamMember.updateMany({
        where: { teamId: membership.team.id, active: true },
        data: { active: false, leftAt: now }
      });
      if (membership.team.dealRoomId) {
        await transaction.dealRoom.updateMany({
          where: { id: membership.team.dealRoomId, status: "ACTIVE" },
          data: { status: "ARCHIVED" }
        });
      }

      return this.findTeamOrThrow(transaction, membership.team.id);
    });
  }

  private async respondToInvite(
    userId: string,
    inviteId: string,
    actorField: "inviterId" | "inviteeId",
    status: "DECLINED" | "CANCELLED"
  ) {
    await this.expireStaleInvites(this.prisma, new Date());
    const invite = await this.prisma.roommateTeamInvite.findUnique({ where: { id: inviteId } });
    this.assertInviteParticipant(invite, userId, actorField);
    if (invite.status === status) return presentRoommateTeamInvite(invite);
    if (invite.status !== "PENDING") throw new ConflictException("组队邀请状态已更新，请刷新后重试");

    const updated = await this.prisma.roommateTeamInvite.updateMany({
      where: { id: invite.id, status: "PENDING" },
      data: { status, respondedAt: new Date() }
    });
    if (updated.count !== 1) throw new ConflictException("组队邀请状态已更新，请刷新后重试");
    const current = await this.prisma.roommateTeamInvite.findUnique({ where: { id: invite.id } });
    if (!current) throw new ConflictException("组队邀请状态已更新，请刷新后重试");
    return presentRoommateTeamInvite(current);
  }

  private async expireStaleInvites(transaction: TransactionClient | PrismaService, now: Date) {
    await transaction.roommateTeamInvite.updateMany({
      where: {
        status: "PENDING",
        expiresAt: { lte: now }
      },
      data: {
        status: "EXPIRED",
        respondedAt: now
      }
    });
  }

  private async assertUsersAvailable(transaction: TransactionClient | PrismaService, userIds: string[]) {
    const membership = await transaction.roommateTeamMember.findFirst({
      where: {
        userId: { in: userIds },
        active: true,
        team: { status: "ACTIVE" }
      }
    });
    if (membership) throw new ConflictException("每位用户同时只能加入一个两人小组");
  }

  private assertInviteParticipant(
    invite: { inviterId: string; inviteeId: string } | null,
    userId: string,
    actorField: "inviterId" | "inviteeId"
  ): asserts invite is NonNullable<typeof invite> & {
    id: string;
    status: string;
    teamId: string | null;
  } {
    if (!invite || invite[actorField] !== userId) {
      throw new NotFoundException("Roommate team invite not found");
    }
  }

  private async findTeamOrThrow(transaction: TransactionClient, teamId: string) {
    const team = await transaction.roommateTeam.findUnique({
      where: { id: teamId },
      include: { members: true }
    });
    if (!team) throw new ConflictException("组队状态已更新，请刷新后重试");
    return presentRoommateTeam(team);
  }

  private async withSerializableRetry<T>(operation: (transaction: TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        });
      } catch (error) {
        if (isUniqueConflict(error)) {
          throw new ConflictException("每位用户同时只能加入一个两人小组");
        }
        if (!isSerializationConflict(error) || attempt === SERIALIZABLE_RETRY_LIMIT) throw error;
      }
    }
    throw new ConflictException("组队状态已更新，请刷新后重试");
  }
}

function toMemberSnapshot(profile: {
  id: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
}) {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    role: profile.role,
    image: profile.image,
    match: profile.match,
    budget: profile.budget,
    commute: profile.commute,
    tags: profile.tags
  };
}

function isPrismaCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

function isUniqueConflict(error: unknown) {
  return isPrismaCode(error, "P2002");
}

function isSerializationConflict(error: unknown) {
  return isPrismaCode(error, "P2034");
}
