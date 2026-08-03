import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AuditActor = {
  actorType: "USER" | "OPERATOR" | "SYSTEM";
  actorUserId?: string;
  actorEmail?: string;
  requestId?: string;
};

export type AuditInput = AuditActor & {
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "SUCCESS" | "BLOCKED" | "NOOP";
  metadata?: Prisma.InputJsonObject;
};

type AuditDatabase = Pick<Prisma.TransactionClient, "auditEvent">;

@Injectable()
export class AuditService {
  append(database: AuditDatabase, input: AuditInput) {
    return database.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        outcome: input.outcome,
        requestId: input.requestId,
        metadata: input.metadata ?? {}
      }
    });
  }
}
