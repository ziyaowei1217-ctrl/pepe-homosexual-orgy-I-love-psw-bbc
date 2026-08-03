import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma, UserRole, type User } from "@prisma/client";

import { AuditService, type AuditInput } from "../audit/audit.service";
import { normalizeEmail } from "../auth/code-security";
import { PrismaService } from "../prisma/prisma.service";
import { maskEmail } from "./beta-invites.service";

export type RoleMutationInput = { email: string; actorEmail: string; reason: string };
type RoleOutcome = "SUCCESS" | "NOOP";
type BlockCode = "USER_NOT_FOUND" | "LAST_ADMIN_REQUIRED";

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

function roleAudit(input: RoleMutationInput, user: User, action: string, outcome: RoleOutcome): AuditInput {
  return {
    actorType: "OPERATOR",
    actorEmail: requireActorEmail(input.actorEmail),
    action,
    targetType: "User",
    targetId: user.id,
    outcome,
    metadata: { reason: requireReason(input.reason) }
  };
}

function toMaskedRoleResult(user: User, outcome: RoleOutcome) {
  return { maskedEmail: maskEmail(user.email), role: user.role, outcome } as const;
}

function blockMessage(code: BlockCode) {
  return code === "USER_NOT_FOUND" ? "User not found" : "At least one administrator is required";
}

@Injectable()
export class AdminRolesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async grant(input: RoleMutationInput) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
      const email = normalizeEmail(input.email);
      const reason = requireReason(input.reason);
      const actorEmail = requireActorEmail(input.actorEmail);
      const normalizedInput = { ...input, email, actorEmail, reason };
      const user = await transaction.user.findUnique({ where: { email } });
      if (!user) {
        await this.audit.append(transaction, {
          actorType: "OPERATOR",
          actorEmail,
          action: "ADMIN_ROLE_GRANT_BLOCKED",
          targetType: "User",
          outcome: "BLOCKED",
          metadata: { reason, code: "USER_NOT_FOUND" }
        });
        return { status: "blocked" as const, code: "USER_NOT_FOUND" as const, message: blockMessage("USER_NOT_FOUND") };
      }
      if (user.role === UserRole.ADMIN) {
        await this.audit.append(transaction, roleAudit(normalizedInput, user, "ADMIN_ROLE_GRANTED", "NOOP"));
        return { status: "ok" as const, user, outcome: "NOOP" as const };
      }
      const updated = await transaction.user.update({ where: { id: user.id }, data: { role: UserRole.ADMIN } });
      await this.audit.append(transaction, roleAudit(normalizedInput, updated, "ADMIN_ROLE_GRANTED", "SUCCESS"));
      return { status: "ok" as const, user: updated, outcome: "SUCCESS" as const };
    });
    if (result.status === "blocked") {
      throw new ConflictException({ statusCode: 409, code: result.code, message: result.message });
    }
    return toMaskedRoleResult(result.user, result.outcome);
  }

  async revoke(input: RoleMutationInput) {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
      const email = normalizeEmail(input.email);
      const reason = requireReason(input.reason);
      const actorEmail = requireActorEmail(input.actorEmail);
      const normalizedInput = { ...input, email, actorEmail, reason };
      const user = await transaction.user.findUnique({ where: { email } });
      if (!user) return this.auditBlocked(transaction, normalizedInput, "USER_NOT_FOUND");
      if (user.role !== UserRole.ADMIN) return this.auditNoop(transaction, normalizedInput, user);
      const adminCount = await transaction.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) return this.auditBlocked(transaction, normalizedInput, "LAST_ADMIN_REQUIRED", user.id);
      const updated = await transaction.user.update({ where: { id: user.id }, data: { role: UserRole.USER } });
      await this.audit.append(transaction, roleAudit(normalizedInput, updated, "ADMIN_ROLE_REVOKED", "SUCCESS"));
      return { status: "ok" as const, user: updated, outcome: "SUCCESS" as const };
    });
    if (result.status === "blocked") {
      throw new ConflictException({ statusCode: 409, code: result.code, message: result.message });
    }
    return toMaskedRoleResult(result.user, result.outcome);
  }

  private async auditBlocked(
    transaction: Prisma.TransactionClient,
    input: RoleMutationInput,
    code: BlockCode,
    targetId?: string
  ) {
    await this.audit.append(transaction, {
      actorType: "OPERATOR",
      actorEmail: requireActorEmail(input.actorEmail),
      action: "ADMIN_ROLE_REVOKE_BLOCKED",
      targetType: "User",
      targetId,
      outcome: "BLOCKED",
      metadata: { reason: requireReason(input.reason), code }
    });
    return { status: "blocked" as const, code, message: blockMessage(code) };
  }

  private async auditNoop(transaction: Prisma.TransactionClient, input: RoleMutationInput, user: User) {
    await this.audit.append(transaction, roleAudit(input, user, "ADMIN_ROLE_REVOKED", "NOOP"));
    return { status: "ok" as const, user, outcome: "NOOP" as const };
  }
}
