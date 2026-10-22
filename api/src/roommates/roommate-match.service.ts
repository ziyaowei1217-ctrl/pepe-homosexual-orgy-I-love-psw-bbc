import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { RoommateActionDtoValue } from "./dto";

const undoWindowMs = 10 * 60_000;

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

  /** Deletes the user's latest action; a LIKE that already formed an active match stays. */
  async undoLastAction(userId: string, now = new Date()) {
    return this.runTransaction(async (transaction) => {
      const last = await transaction.roommateAction.findFirst({
        where: { userId },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        include: { roommateProfile: { select: { ownerId: true } } }
      });
      if (!last) throw new ConflictException("没有可以撤回的操作");
      if (now.getTime() - last.updatedAt.getTime() > undoWindowMs) throw new ConflictException("只能撤回 10 分钟内的操作");
      const peerId = last.roommateProfile.ownerId;
      if (last.action === "LIKE" && peerId && peerId !== userId) {
        const match = await transaction.roommateMatch.findUnique({
          where: { firstUserId_secondUserId: normalizeUserPair(userId, peerId) },
          select: { status: true }
        });
        if (match?.status === "ACTIVE") throw new ConflictException("已经配对，不能撤回");
      }
      await transaction.roommateAction.delete({ where: { id: last.id } });
      return { roommateProfileId: last.roommateProfileId, action: last.action };
    });
  }

  private async recordActionInTransaction(
    transaction: Prisma.TransactionClient,
    actorUserId: string,
    targetProfileId: string,
    action: RoommateActionDtoValue
  ) {
    const targetProfile = await transaction.roommateProfile.findUnique({ where: { id: targetProfileId } });
    if (!targetProfile) throw new NotFoundException("Roommate profile not found");
    if (targetProfile.ownerId === actorUserId) throw new BadRequestException("Cannot match with yourself");

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

    const actorProfile = await transaction.roommateProfile.findUnique({ where: { ownerId: actorUserId } });
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

function isTransactionConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}
