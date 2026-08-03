import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AuditActor = {
  actorType: "USER" | "OPERATOR" | "SYSTEM";
  actorUserId?: string;
  actorEmail?: string;
  requestId?: string;
};

const auditMetadataKeys = ["reason", "code", "method"] as const;

type AuditMetadataKey = (typeof auditMetadataKeys)[number];

export type AuditMetadata = Partial<Record<AuditMetadataKey, string>>;

export type AuditInput = AuditActor & {
  action: string;
  targetType: string;
  targetId?: string;
  outcome: "SUCCESS" | "BLOCKED" | "NOOP";
  metadata?: AuditMetadata;
};

type AuditDatabase = Pick<Prisma.TransactionClient, "auditEvent">;

function isSensitiveMetadataValue(value: string) {
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i.test(value) ||
    /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(value) ||
    /^\s*\d{6}\s*$/.test(value)
  );
}

function sanitizeMetadata(metadata: AuditMetadata | undefined): Prisma.InputJsonObject {
  if (!metadata) {
    return {};
  }

  const sanitized: Record<string, Prisma.InputJsonValue> = {};
  for (const key of auditMetadataKeys) {
    const value = metadata[key];
    if (typeof value === "string") {
      sanitized[key] = isSensitiveMetadataValue(value) ? "[REDACTED]" : value;
    }
  }
  return sanitized;
}

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
        metadata: sanitizeMetadata(input.metadata)
      }
    });
  }
}
