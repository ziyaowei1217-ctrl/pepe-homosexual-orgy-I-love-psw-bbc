import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

export type AuditActor = {
  actorType: "USER" | "OPERATOR" | "SYSTEM";
  actorUserId?: string;
  actorEmail?: string;
  requestId?: string;
};

const auditMetadataKeys = ["reason", "code", "method"] as const;
const redactedMetadataValue = "[REDACTED]";
const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

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

function redactSensitiveSubstrings(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, redactedMetadataValue)
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, redactedMetadataValue)
    .replace(/\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, redactedMetadataValue)
    .replace(/(?<!\d)\d{6}(?!\d)/g, redactedMetadataValue);
}

function sanitizeReason(value: string) {
  if (/\r|\n|<\/?[a-z][^>]*>?|\b[A-Za-z0-9-]+\s*:/i.test(value) || value.length > 240) {
    return redactedMetadataValue;
  }
  return redactSensitiveSubstrings(value.trim());
}

function sanitizeCode(value: string) {
  return /^[A-Z][A-Z0-9_]{0,63}$/.test(value) && !/\d{6}/.test(value) ? value : redactedMetadataValue;
}

function sanitizeMethod(value: string) {
  return allowedMethods.has(value) ? value : redactedMetadataValue;
}

function sanitizeMetadata(metadata: AuditMetadata | undefined): Prisma.InputJsonObject {
  if (!metadata) {
    return {};
  }

  const sanitized: Record<string, Prisma.InputJsonValue> = {};
  for (const key of auditMetadataKeys) {
    const value = metadata[key];
    if (typeof value === "string") {
      sanitized[key] =
        key === "reason" ? sanitizeReason(value) : key === "code" ? sanitizeCode(value) : sanitizeMethod(value);
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
