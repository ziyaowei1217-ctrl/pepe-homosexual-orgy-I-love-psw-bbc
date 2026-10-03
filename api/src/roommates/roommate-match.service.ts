import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { RoommateActionDtoValue } from "./dto";

export function normalizeUserPair(leftId: string, rightId: string) {
  if (leftId === rightId) throw new BadRequestException("Cannot match with yourself");
  return leftId < rightId
    ? { firstUserId: leftId, secondUserId: rightId }
    : { firstUserId: rightId, secondUserId: leftId };
}

@Injectable()
export class RoommateMatchService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async recordAction(actorUserId: string, targetProfileId: string, action: RoommateActionDtoValue) {
    return this.runTransaction((transaction) => this.recordActionInTransaction(transaction, actorUserId, targetProfileId, action));
  }

  private async recordActionInTransaction(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    targetProfileId: string,
    action: RoommateActionDtoValue
  ) {
    // Serialize visibility changes with actions. Lock both profiles in stable
    // order so opposite-direction likes cannot deadlock on each other's row.
    await transaction.$queryRaw`SELECT "id" FROM "RoommateProfile"
      WHERE "id" = ${targetProfileId} OR "ownerId" = ${actorUserId}
      ORDER BY "id" FOR NO KEY UPDATE`;
    const targetProfile = await transaction.roommateProfile.findUnique({ where: { id: targetProfileId } });
    if (!isDiscoverable(targetProfile) || (process.env.NODE_ENV === "production" && !targetProfile.ownerId)) {
      throw new NotFoundException("Roommate profile not found");
    }
    if (targetProfile.ownerId === actorUserId) throw new BadRequestException("Cannot match with yourself");
    const actorProfile = await transaction.roommateProfile.findUnique({ where: { ownerId: actorUserId } });
    // A persisted LIKE appears in the peer's inbound activity even without a
    // conversation. Hidden actors must opt back in before publishing an action.
    if (actorProfile && !isDiscoverable(actorProfile)) {
      throw new BadRequestException("An active roommate profile is required to record actions");
    }

    const recordedAction = await transaction.roommateAction.upsert({
      where: {
        userId_roommateProfileId: {
          userId: actorUserId,
          roommateProfileId: targetProfile.id
        }
      },
      create: {
        userId: actorUserId,
        roommateProfileId: targetProfile.id,
        action
      },
      update: { action }
    });

    if (action !== "LIKE" || !targetProfile.ownerId) {
      return { action: recordedAction, match: null, conversation: null };
    }

    if (!actorProfile) {
      return { action: recordedAction, match: null, conversation: null };
    }

    const reverseLike = await transaction.roommateAction.findFirst({
      where: {
        userId: targetProfile.ownerId,
        roommateProfileId: actorProfile.id,
        action: "LIKE"
      }
    });
    if (!reverseLike) {
      return { action: recordedAction, match: null, conversation: null };
    }

    const pair = normalizeUserPair(actorUserId, targetProfile.ownerId);
    const match = await transaction.roommateMatch.upsert({
      where: {
        firstUserId_secondUserId: pair
      },
      create: pair,
      update: {}
    });
    const conversation = await transaction.roommateConversation.upsert({
      where: { matchId: match.id },
      create: { matchId: match.id },
      update: {}
    });
    await transaction.roommateConversationMember.createMany({
      data: [
        { conversationId: conversation.id, userId: pair.firstUserId },
        { conversationId: conversation.id, userId: pair.secondUserId }
      ],
      skipDuplicates: true
    });

    return { action: recordedAction, match, conversation };
  }

  private async runTransaction<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!isTransactionConflict(error) || attempt === 2) throw error;
      }
    }

    throw new Error("Unreachable transaction retry state");
  }
}

function isDiscoverable<T extends { status: string; archivedAt: Date | null }>(profile: T | null): profile is T {
  return profile !== null && profile.status === "active" && profile.archivedAt === null;
}

function isTransactionConflict(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  // Raw row locks can surface PostgreSQL serialization/deadlock SQLSTATEs as
  // P2010 rather than the model-operation transaction-conflict code P2034.
  return error.code === "P2034" ||
    (error.code === "P2010" && (error.meta?.code === "40001" || error.meta?.code === "40P01"));
}
