import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BetaInvite, VerificationPurpose } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { acquireNormalizedEmailAdvisoryLock } from "../auth/email-advisory-lock";
import { PrismaService } from "../prisma/prisma.service";
import { maskEmail, requireOperationsEmail, requireOperationsReason } from "./operations-input";

export type InviteMutationInput = { email: string; actorEmail: string; reason: string };
export { maskEmail } from "./operations-input";

type InviteState = "ACTIVE" | "CLAIMED" | "REVOKED";
const redactedOperatorReference = "[REDACTED]";

function inviteState(invite: Pick<BetaInvite, "claimedAt" | "revokedAt">): InviteState {
  if (invite.revokedAt) return "REVOKED";
  if (invite.claimedAt) return "CLAIMED";
  return "ACTIVE";
}

function toMaskedInvite(invite: BetaInvite) {
  return {
    id: invite.id,
    maskedEmail: maskEmail(invite.normalizedEmail),
    status: inviteState(invite),
    invitedAt: invite.invitedAt,
    claimedAt: invite.claimedAt,
    revokedAt: invite.revokedAt
  } as const;
}

@Injectable()
export class BetaInvitesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async add(input: InviteMutationInput) {
    const normalizedInput = normalizeInviteInput(input);
    return this.prisma.$transaction(async (transaction) => {
      const { email, reason, actorEmail } = normalizedInput;
      await acquireNormalizedEmailAdvisoryLock(transaction, email);
      const existingUser = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) throw new BadRequestException("Registered users do not need beta invites");
      const existing = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      const state = existing ? inviteState(existing) : undefined;
      const invite = state === "REVOKED"
        ? await transaction.betaInvite.update({
            where: { id: existing!.id },
            data: {
              createdBy: redactedOperatorReference,
              reason,
              invitedAt: new Date(),
              claimedAt: null,
              revokedAt: null,
              revokedBy: null,
              revocationReason: null
            }
          })
        : existing ??
          (await transaction.betaInvite.create({
            data: { normalizedEmail: email, createdBy: redactedOperatorReference, reason }
          }));
      await this.audit.append(transaction, {
        actorType: "OPERATOR",
        actorEmail,
        action: "BETA_INVITE_CREATED",
        targetType: "BetaInvite",
        targetId: invite.id,
        outcome: state === "ACTIVE" || state === "CLAIMED" ? "NOOP" : "SUCCESS",
        metadata: { reason }
      });
      return toMaskedInvite(invite);
    });
  }

  list() {
    return this.prisma.betaInvite.findMany({ orderBy: { invitedAt: "desc" } }).then((rows) => rows.map(toMaskedInvite));
  }

  async revoke(input: InviteMutationInput) {
    const normalizedInput = normalizeInviteInput(input);
    return this.prisma.$transaction(async (transaction) => {
      const { email, reason, actorEmail } = normalizedInput;
      await acquireNormalizedEmailAdvisoryLock(transaction, email);
      const invite = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      if (!invite) throw new NotFoundException("Beta invite not found");
      const state = inviteState(invite);
      if (state === "CLAIMED") {
        await this.audit.append(transaction, {
          actorType: "OPERATOR",
          actorEmail,
          action: "BETA_INVITE_REVOKE_BLOCKED",
          targetType: "BetaInvite",
          targetId: invite.id,
          outcome: "BLOCKED",
          metadata: { reason, code: "BETA_INVITE_ALREADY_CLAIMED" }
        });
        return { status: "blocked" as const };
      }
      if (state === "REVOKED") {
        await this.audit.append(transaction, {
          actorType: "OPERATOR",
          actorEmail,
          action: "BETA_INVITE_REVOKED",
          targetType: "BetaInvite",
          targetId: invite.id,
          outcome: "NOOP",
          metadata: { reason }
        });
        return { status: "ok" as const, invite };
      }

      const revokedAt = new Date();
      const result = await transaction.betaInvite.update({
        where: { id: invite.id },
        data: { revokedAt, revokedBy: redactedOperatorReference, revocationReason: reason }
      });
      await transaction.verificationCode.updateMany({
        where: { email, purpose: VerificationPurpose.LOGIN, consumedAt: null },
        data: { consumedAt: revokedAt }
      });
      await this.audit.append(transaction, {
        actorType: "OPERATOR",
        actorEmail,
        action: "BETA_INVITE_REVOKED",
        targetType: "BetaInvite",
        targetId: invite.id,
        outcome: "SUCCESS",
        metadata: { reason }
      });
      return { status: "ok" as const, invite: result };
    }).then((result) => {
      if (result.status === "blocked") {
        throw new ConflictException({
          statusCode: 409,
          code: "BETA_INVITE_ALREADY_CLAIMED",
          message: "Claimed beta invites cannot be revoked"
        });
      }
      return toMaskedInvite(result.invite);
    });
  }
}

function normalizeInviteInput(input: InviteMutationInput) {
  return {
    email: requireOperationsEmail(input.email, "Target"),
    actorEmail: requireOperationsEmail(input.actorEmail, "Operator"),
    reason: requireOperationsReason(input.reason)
  };
}
