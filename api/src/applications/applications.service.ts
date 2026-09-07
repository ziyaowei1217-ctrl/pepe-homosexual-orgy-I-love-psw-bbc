import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { Prisma, RentalApplicationScope } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { DealThreadsService } from "../deal-threads/deal-threads.service";
import { validateListingAvailability } from "../listings/listing-availability";
import { PAYMENT_COMMANDS, type PaymentCommands } from "../payments/payment-commands";
import { PaymentOperationsService } from "../payments/payment-operations.service";
import { applicationBusinessDate, assertMoveInNotPast } from "./application-business-date";
import { requireIdempotencyKey } from "./application-idempotency";
import type { ApplicationDecisionDto, CancelRentalApplicationDto, CreateRentalApplicationDto } from "./applications.dto";
import { presentRentalApplication } from "./applications.presenter";

type ApplicationRecord = Prisma.RentalApplicationGetPayload<Record<string, never>>;

const unavailablePaymentCommands: PaymentCommands = {
  ensureOrderForAcceptedApplication: async () => {
    throw new Error("Demo payment commands are not configured");
  },
  refundForCancellation: async () => {
    throw new Error("Demo payment commands are not configured");
  }
};
const unavailableDealThreads: Pick<DealThreadsService, "createOrFindApplicationThread"> = {
  createOrFindApplicationThread: async () => null as never
};
const applicationListingInclude = {
  listing: {
    select: {
      title: true
    }
  }
};

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_COMMANDS) private readonly payments: PaymentCommands = unavailablePaymentCommands,
    @Optional() @Inject(DealThreadsService) private readonly dealThreads: Pick<DealThreadsService, "createOrFindApplicationThread"> = unavailableDealThreads,
    @Optional() @Inject(PaymentOperationsService) private readonly paymentOperations: PaymentOperationsService = new PaymentOperationsService(prisma, payments)
  ) {}

  async create(userId: string, rawKey: unknown, dto: CreateRentalApplicationDto) {
    const createKey = requireIdempotencyKey(rawKey);
    const dates = applicationDates(dto.moveIn, dto.moveOut);
    const normalized = {
      ...dto,
      contactName: dto.contactName?.trim() ?? null,
      contactEmail: dto.contactEmail?.trim() ?? null,
      schoolOrOccupation: dto.schoolOrOccupation.trim(),
      note: dto.note.trim(),
      teamId: dto.scope === RentalApplicationScope.TEAM ? dto.teamId : undefined
    };

    const retry = await this.prisma.rentalApplication.findUnique({ where: { createKey } });
    if (retry) {
      if (sameCreateRequest(retry, userId, normalized, dates)) return presentRentalApplication(retry);
      throw new ConflictException("Idempotency-Key is already bound to a different application request");
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        assertMoveInNotPast(dates.moveIn);
        const listing = await transaction.listing.findUnique({ where: { id: normalized.listingId } });
        if (!listing || listing.status !== "APPROVED") throw new NotFoundException("Listing not found");
        if (listing.ownerId === userId) throw new ConflictException("不能申请自己发布的房源");
        assertWithinListing(dates, listing);

        const scope = await this.resolveScope(userId, normalized.scope, normalized.teamId, transaction);
        assertNoListingOwner(listing.ownerId, scope.memberIds);
        const memberSnapshots = await Promise.all(
          scope.memberIds.sort().map((memberId) => this.resolveDisplaySnapshot(memberId, scope.fallbackNames.get(memberId), transaction))
        );
        const activeKey = normalized.scope === RentalApplicationScope.SOLO
          ? `solo:${listing.id}:${userId}`
          : `team:${listing.id}:${scope.teamId}`;

        const created = await transaction.rentalApplication.create({
          data: {
            listingId: listing.id,
            listingOwnerId: listing.ownerId,
            submitterId: userId,
            teamId: scope.teamId,
            scope: normalized.scope,
            status: "DRAFT",
            activeKey,
            acceptedListingKey: null,
            memberSnapshots,
            contactName: normalized.contactName,
            contactEmail: normalized.contactEmail,
            moveIn: dates.moveIn,
            moveOut: dates.moveOut,
            schoolOrOccupation: normalized.schoolOrOccupation,
            incomeBand: normalized.incomeBand,
            guarantorStatus: normalized.guarantorStatus,
            note: normalized.note,
            createKey,
            submitKey: null,
            withdrawKey: null,
            decisionKey: null,
            cancelKey: null,
            submittedAt: null,
            decidedAt: null,
            decisionById: null,
            decisionReason: null,
            withdrawnAt: null,
            cancelledAt: null,
            cancelledById: null,
            cancellationReason: null
          }
        });
        return presentRentalApplication(created);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const winner = await this.prisma.rentalApplication.findUnique({ where: { createKey } });
      if (winner && sameCreateRequest(winner, userId, normalized, dates)) return presentRentalApplication(winner);
      throw new ConflictException("该房源已有进行中的申请");
    }
  }

  async mine(userId: string) {
    const applications = await this.prisma.rentalApplication.findMany({
      where: {
        OR: [
          { submitterId: userId },
          { team: { members: { some: { userId } } } }
        ]
      },
      orderBy: { updatedAt: "desc" },
      include: applicationListingInclude
    });
    return applications.map(presentRentalApplication);
  }

  async hostInbox(userId: string) {
    const applications = await this.prisma.rentalApplication.findMany({
      where: { listingOwnerId: userId },
      orderBy: { updatedAt: "desc" },
      include: applicationListingInclude
    });
    return applications.map(presentRentalApplication);
  }

  async findOne(userId: string, id: string) {
    const application = await this.prisma.rentalApplication.findUnique({ where: { id } });
    if (!application || !(await this.canView(userId, application))) {
      throw new NotFoundException("Rental application not found");
    }
    return presentRentalApplication(application);
  }

  async submit(userId: string, id: string, rawKey: unknown) {
    const submitKey = requireIdempotencyKey(rawKey);
    const submitted = await this.runSerializableCommand(async (transaction) => {
      const retry = await transaction.rentalApplication.findUnique({ where: { submitKey } });
      if (retry) return this.requireMatchingCommandRetry(retry, userId, id, "submit");
      const application = await this.requireSubmitter(userId, id, transaction);
      if (application.status !== "DRAFT") throw new ConflictException("申请状态已更新，请刷新后重试");
      const listing = await transaction.listing.findUnique({ where: { id: application.listingId } });
      if (!listing || listing.status !== "APPROVED") throw new ConflictException("房源当前不可申请");
      assertCurrentListing(application, listing);
      if (application.scope === RentalApplicationScope.TEAM) {
        const scope = await this.resolveScope(userId, application.scope, application.teamId ?? undefined, transaction);
        assertNoListingOwner(listing.ownerId, scope.memberIds);
      }
      const blocking = await transaction.rentalApplication.findFirst({
        where: { listingId: application.listingId, status: { in: ["ACCEPTED", "CANCELLATION_PENDING", "COMPLETED"] } }
      });
      if (blocking) throw new ConflictException("LISTING_APPLICATION_IN_PROGRESS");

      const now = new Date();
      const transition = await transaction.rentalApplication.updateMany({
        where: { id, status: "DRAFT" },
        data: { status: "SUBMITTED", submittedAt: now, submitKey }
      });
      if (transition.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
      return findApplicationOrThrow(transaction, id);
    });
    await this.dealThreads.createOrFindApplicationThread(userId, submitted.id);
    return submitted;
  }

  async withdraw(userId: string, id: string, rawKey: unknown) {
    const withdrawKey = requireIdempotencyKey(rawKey);
    const retry = await this.prisma.rentalApplication.findUnique({ where: { withdrawKey } });
    if (retry) return this.requireMatchingCommandRetry(retry, userId, id, "withdraw");

    const application = await this.requireSubmitter(userId, id);
    if (application.status !== "DRAFT" && application.status !== "SUBMITTED") {
      throw new ConflictException("只有草稿或已提交申请可以撤回");
    }
    const now = new Date();
    const transition = await this.prisma.rentalApplication.updateMany({
      where: { id, status: { in: ["DRAFT", "SUBMITTED"] } },
      data: { status: "WITHDRAWN", activeKey: null, withdrawnAt: now, withdrawKey }
    });
    if (transition.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
    return this.findByIdOrThrow(id);
  }

  async accept(userId: string, id: string, rawKey: unknown, dto: ApplicationDecisionDto = {}) {
    const decisionKey = requireIdempotencyKey(rawKey);
    const reason = normalizeOptionalReason(dto.reason);
    let accepted;
    try {
      accepted = await this.runSerializableCommand(async (transaction) => {
        const retry = await transaction.rentalApplication.findUnique({ where: { decisionKey } });
        if (retry) {
          if (retry.id === id && retry.listingOwnerId === userId && retry.status === "ACCEPTED" && retry.decisionReason === reason) {
            return presentRentalApplication(retry);
          }
          throw new ConflictException("Idempotency-Key is already bound to a different application decision");
        }
        const application = await requireOwnerApplication(transaction, userId, id);
        if (application.status !== "SUBMITTED") throw new ConflictException("只有已提交申请可以接受");
        const listing = await transaction.listing.findUnique({ where: { id: application.listingId } });
        if (!listing || listing.status !== "APPROVED") throw new ConflictException("房源当前不可申请");
        assertCurrentListing(application, listing);
        if (application.scope === RentalApplicationScope.TEAM) {
          const scope = await this.resolveScope(application.submitterId, application.scope, application.teamId ?? undefined, transaction);
          assertNoListingOwner(listing.ownerId, scope.memberIds);
        }
        const now = new Date();
        const transition = await transaction.rentalApplication.updateMany({
          where: { id, status: "SUBMITTED" },
          data: {
            status: "ACCEPTED",
            acceptedListingKey: application.listingId,
            decisionKey,
            decidedAt: now,
            decisionById: userId,
            decisionReason: reason
          }
        });
        if (transition.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
        if (this.payments.execution === "remote") {
          await this.paymentOperations.enqueue(transaction, id, "ACCEPT");
        } else {
          await this.payments.ensureOrderForAcceptedApplication(transaction, id);
        }
        return findApplicationOrThrow(transaction, id);
      });
    } catch (error) {
      if (isUniqueConflict(error)) throw new ConflictException("LISTING_APPLICATION_IN_PROGRESS");
      throw error;
    }
    if (this.payments.execution === "remote") await this.paymentOperations.processApplication(id);
    return accepted;
  }

  async reject(userId: string, id: string, rawKey: unknown, dto: ApplicationDecisionDto) {
    const decisionKey = requireIdempotencyKey(rawKey);
    const reason = normalizeRequiredReason(dto.reason);
    return this.runSerializableCommand(async (transaction) => {
      const retry = await transaction.rentalApplication.findUnique({ where: { decisionKey } });
      if (retry) {
        if (retry.id === id && retry.listingOwnerId === userId && retry.status === "REJECTED" && retry.decisionReason === reason) {
          return presentRentalApplication(retry);
        }
        throw new ConflictException("Idempotency-Key is already bound to a different application decision");
      }
      const application = await requireOwnerApplication(transaction, userId, id);
      if (application.status !== "SUBMITTED") throw new ConflictException("只有已提交申请可以拒绝");
      const now = new Date();
      const transition = await transaction.rentalApplication.updateMany({
        where: { id, status: "SUBMITTED" },
        data: {
          status: "REJECTED",
          activeKey: null,
          decisionKey,
          decidedAt: now,
          decisionById: userId,
          decisionReason: reason
        }
      });
      if (transition.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
      return findApplicationOrThrow(transaction, id);
    });
  }

  private async runSerializableCommand<T>(command: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    // Re-run the identity, authorization and state checks in a fresh snapshot.
    // Conversation completion and remote payment processing run after this loop.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(command, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
        if (attempt === 2) throw new ServiceUnavailableException("Application is busy; retry with the same Idempotency-Key");
      }
    }
    throw new ServiceUnavailableException("Application is busy; retry with the same Idempotency-Key");
  }

  async cancel(userId: string, id: string, rawKey: unknown, dto: CancelRentalApplicationDto) {
    const cancelKey = requireIdempotencyKey(rawKey);
    const reason = normalizeRequiredReason(dto.reason);
    const retry = await this.prisma.rentalApplication.findUnique({ where: { cancelKey } });
    if (retry) {
      if (retry.id === id && retry.cancelledById === userId && retry.cancellationReason === reason) {
        if (this.payments.execution === "remote") return this.finishRemoteCancellation(id);
        return presentRentalApplication(retry);
      }
      throw new ConflictException("Idempotency-Key is already bound to a different cancellation request");
    }

    return this.prisma.$transaction(async (transaction) => {
      const application = await transaction.rentalApplication.findUnique({ where: { id } });
      if (!application || (application.submitterId !== userId && application.listingOwnerId !== userId)) {
        throw new NotFoundException("Rental application not found");
      }
      if (application.status !== "ACCEPTED") throw new ConflictException("只有已接受申请可以取消");
      if (applicationBusinessDate() >= application.moveIn.toISOString().slice(0, 10)) throw new ConflictException("约定入住日期起不能取消申请");
      if (this.payments.execution === "remote") {
        if (application.cancelKey) throw new ConflictException("已有取消请求，请查看处理结果");
        const reserved = await transaction.rentalApplication.updateMany({
          where: { id, status: "ACCEPTED", cancelKey: null },
          data: { status: "CANCELLATION_PENDING", cancelKey, cancelledById: userId, cancellationReason: reason }
        });
        if (reserved.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
        await this.paymentOperations.enqueue(transaction, id, "CANCEL", userId);
        return findApplicationOrThrow(transaction, id);
      }
      const refund = await this.payments.refundForCancellation(transaction, id, userId, cancelKey);
      if (refund === "RELEASED") throw new ConflictException("资金已释放，不能取消申请");
      const now = new Date();
      const transition = await transaction.rentalApplication.updateMany({
        where: { id, status: "ACCEPTED" },
        data: {
          status: "CANCELLED",
          activeKey: null,
          acceptedListingKey: null,
          cancelKey,
          cancelledAt: now,
          cancelledById: userId,
          cancellationReason: reason
        }
      });
      if (transition.count !== 1) throw new ConflictException("申请状态已更新，请刷新后重试");
      return findApplicationOrThrow(transaction, id);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }).then(async application => {
      if (this.payments.execution === "remote") return this.finishRemoteCancellation(id);
      return application;
    });
  }

  private async finishRemoteCancellation(id: string) {
    await this.paymentOperations.processApplication(id);
    const operation = await this.prisma.paymentOperation.findUnique({ where: { applicationId_kind: { applicationId: id, kind: "CANCEL" } } });
    if (operation?.status === "BLOCKED") throw new ConflictException("资金已释放，不能取消申请");
    return this.findByIdOrThrow(id);
  }

  private async resolveScope(userId: string, scope: RentalApplicationScope, teamId?: string, client: Prisma.TransactionClient = this.prisma) {
    if (scope === RentalApplicationScope.SOLO) {
      if (teamId) throw new BadRequestException("Solo applications cannot include a team");
      return { teamId: null, memberIds: [userId], fallbackNames: new Map<string, string>() };
    }
    if (!teamId) throw new BadRequestException("Team applications require teamId");
    const team = await client.roommateTeam.findUnique({
      where: { id: teamId },
      include: { members: true }
    });
    if (!team) throw new NotFoundException("Roommate team not found");
    if (team.status !== "ACTIVE") throw new ConflictException("小组已解散，不能创建或提交申请");
    const activeMembers = team.members.filter((member) => member.active);
    if (!activeMembers.some((member) => member.userId === userId)) {
      throw new NotFoundException("Roommate team not found");
    }
    if (activeMembers.length !== 2) throw new ConflictException("小组成员状态不可用");
    return {
      teamId,
      memberIds: activeMembers.map((member) => member.userId),
      fallbackNames: new Map(
        activeMembers.map((member) => [member.userId, snapshotName(member.snapshot)] as const)
      )
    };
  }

  private async resolveDisplaySnapshot(userId: string, fallbackName?: string, client: Prisma.TransactionClient = this.prisma) {
    const user = await client.user.findUnique({ where: { id: userId } });
    if (!user) throw new ConflictException("申请成员账户不可用");
    const [profile, roommateProfile] = await Promise.all([
      client.profile.findUnique({ where: { email: user.email } }),
      client.roommateProfile.findUnique({ where: { ownerId: userId } })
    ]);
    const displayName = profile?.displayName?.trim() || roommateProfile?.name?.trim() || fallbackName?.trim() || user.email.split("@")[0];
    return { userId, displayName };
  }

  private async canView(userId: string, application: ApplicationRecord) {
    if (application.submitterId === userId || application.listingOwnerId === userId) return true;
    if (!application.teamId) return false;
    const team = await this.prisma.roommateTeam.findUnique({ where: { id: application.teamId }, include: { members: true } });
    return Boolean(team?.members.some((member) => member.userId === userId));
  }

  private async requireSubmitter(userId: string, id: string, client: Prisma.TransactionClient = this.prisma) {
    const application = await client.rentalApplication.findUnique({ where: { id } });
    if (!application || application.submitterId !== userId) throw new NotFoundException("Rental application not found");
    return application;
  }

  private requireMatchingCommandRetry(application: ApplicationRecord, userId: string, id: string, command: string) {
    if (application.id !== id || application.submitterId !== userId) {
      throw new ConflictException(`Idempotency-Key is already bound to a different ${command} request`);
    }
    return presentRentalApplication(application);
  }

  private async findByIdOrThrow(id: string) {
    const application = await this.prisma.rentalApplication.findUnique({ where: { id } });
    if (!application) throw new ConflictException("申请状态已更新，请刷新后重试");
    return presentRentalApplication(application);
  }
}

async function requireOwnerApplication(
  transaction: Pick<Prisma.TransactionClient, "rentalApplication">,
  userId: string,
  id: string
) {
  const application = await transaction.rentalApplication.findUnique({ where: { id } });
  if (!application || application.listingOwnerId !== userId) throw new NotFoundException("Rental application not found");
  return application;
}

async function findApplicationOrThrow(
  transaction: Pick<Prisma.TransactionClient, "rentalApplication">,
  id: string
) {
  const application = await transaction.rentalApplication.findUnique({ where: { id } });
  if (!application) throw new ConflictException("申请状态已更新，请刷新后重试");
  return presentRentalApplication(application);
}

function normalizeRequiredReason(value: string | undefined) {
  const reason = value?.trim() ?? "";
  if (!reason || reason.length > 500) throw new BadRequestException("Reason must contain 1-500 characters");
  return reason;
}

function normalizeOptionalReason(value: string | undefined) {
  if (value === undefined) return null;
  return normalizeRequiredReason(value);
}

function applicationDates(moveIn: string, moveOut: string) {
  const availability = validateListingAvailability(moveIn, moveOut);
  return { moveIn: availability.availableFrom, moveOut: availability.availableTo };
}

function assertWithinListing(
  dates: { moveIn: Date; moveOut: Date },
  listing: { availableFrom: Date; availableTo: Date }
) {
  if (dates.moveIn < listing.availableFrom || dates.moveOut > listing.availableTo) {
    throw new BadRequestException("申请日期必须完整落在房源可租日期内");
  }
}

function assertCurrentListing(
  application: ApplicationRecord,
  listing: { ownerId: string; availableFrom: Date; availableTo: Date }
) {
  if (listing.ownerId !== application.listingOwnerId || listing.ownerId === application.submitterId) {
    throw new ConflictException("房源归属已变更，请重新申请");
  }
  const memberIds = Array.isArray(application.memberSnapshots)
    ? application.memberSnapshots.flatMap((member) =>
      member && typeof member === "object" && !Array.isArray(member) && typeof member.userId === "string" ? [member.userId] : [])
    : [];
  assertNoListingOwner(listing.ownerId, memberIds);
  assertMoveInNotPast(application.moveIn);
  assertWithinListing(application, listing);
}

function assertNoListingOwner(ownerId: string, memberIds: string[]) {
  if (memberIds.includes(ownerId)) throw new ConflictException("申请成员不能包含房源发布者");
}

function sameCreateRequest(
  application: ApplicationRecord,
  userId: string,
  dto: CreateRentalApplicationDto,
  dates: { moveIn: Date; moveOut: Date }
) {
  return application.submitterId === userId &&
    application.listingId === dto.listingId &&
    application.scope === dto.scope &&
    application.teamId === (dto.scope === RentalApplicationScope.TEAM ? dto.teamId ?? null : null) &&
    (application.contactName ?? null) === (dto.contactName?.trim() ?? null) &&
    (application.contactEmail ?? null) === (dto.contactEmail?.trim() ?? null) &&
    application.moveIn.getTime() === dates.moveIn.getTime() &&
    application.moveOut.getTime() === dates.moveOut.getTime() &&
    application.schoolOrOccupation === dto.schoolOrOccupation.trim() &&
    application.incomeBand === dto.incomeBand &&
    application.guarantorStatus === dto.guarantorStatus &&
    application.note === dto.note.trim();
}

function snapshotName(value: Prisma.JsonValue): string {
  if (value && typeof value === "object" && !Array.isArray(value) && typeof value.name === "string") return value.name;
  return "";
}

function isUniqueConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}
