import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { BetaInvite, VerificationPurpose } from "@prisma/client";

import { AuditService } from "../audit/audit.service";
import { normalizeEmail } from "../auth/code-security";
import { PrismaService } from "../prisma/prisma.service";

export type InviteMutationInput = { email: string; actorEmail: string; reason: string };

function requireReason(input: string) {
  const reason = input.trim();
  if (!reason) throw new BadRequestException("Reason is required");
  return reason;
}

function requireActorEmail(input: string) {
  const actorEmail = normalizeEmail(input);
  if (!actorEmail) throw new BadRequestException("Operator email is required");
  return actorEmail;
}

export function maskEmail(input: string) {
  const [local, domain] = normalizeEmail(input).split("@");
  const visibleLocal =
    local.length <= 2 ? `${local[0]}*` : `${local[0]}${"*".repeat(local.length - 2)}${local.at(-1)}`;
  return `${visibleLocal}@${domain}`;
}

function toMaskedInvite(invite: BetaInvite) {
  return {
    id: invite.id,
    maskedEmail: maskEmail(invite.normalizedEmail),
    status: invite.revokedAt ? "REVOKED" : invite.claimedAt ? "CLAIMED" : "ACTIVE",
    invitedAt: invite.invitedAt,
    claimedAt: invite.claimedAt,
    revokedAt: invite.revokedAt
  } as const;
}

@Injectable()
export class BetaInvitesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  add(input: InviteMutationInput) {
    return this.prisma.$transaction(async (transaction) => {
      const email = normalizeEmail(input.email);
      const reason = requireReason(input.reason);
      const actorEmail = requireActorEmail(input.actorEmail);
      const existingUser = await transaction.user.findUnique({ where: { email }, select: { id: true } });
      if (existingUser) throw new BadRequestException("Registered users do not need beta invites");
      const existing = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      const invite = existing?.revokedAt
        ? await transaction.betaInvite.update({
            where: { id: existing.id },
            data: {
              createdBy: actorEmail,
              reason,
              invitedAt: new Date(),
              claimedAt: null,
              revokedAt: null,
              revokedBy: null,
              revocationReason: null
            }
          })
        : existing ??
          (await transaction.betaInvite.create({ data: { normalizedEmail: email, createdBy: actorEmail, reason } }));
      await this.audit.append(transaction, {
        actorType: "OPERATOR",
        actorEmail,
        action: "BETA_INVITE_CREATED",
        targetType: "BetaInvite",
        targetId: invite.id,
        outcome: existing && !existing.revokedAt ? "NOOP" : "SUCCESS",
        metadata: { reason }
      });
      return toMaskedInvite(invite);
    });
  }

  list() {
    return this.prisma.betaInvite.findMany({ orderBy: { invitedAt: "desc" } }).then((rows) => rows.map(toMaskedInvite));
  }

  revoke(input: InviteMutationInput) {
    return this.prisma.$transaction(async (transaction) => {
      const email = normalizeEmail(input.email);
      const reason = requireReason(input.reason);
      const actorEmail = requireActorEmail(input.actorEmail);
      const invite = await transaction.betaInvite.findUnique({ where: { normalizedEmail: email } });
      if (!invite) throw new NotFoundException("Beta invite not found");
      const revokedAt = invite.revokedAt ?? new Date();
      const result = invite.revokedAt
        ? invite
        : await transaction.betaInvite.update({
            where: { id: invite.id },
            data: { revokedAt, revokedBy: actorEmail, revocationReason: reason }
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
        outcome: invite.revokedAt ? "NOOP" : "SUCCESS",
        metadata: { reason }
      });
      return toMaskedInvite(result);
    });
  }
}
