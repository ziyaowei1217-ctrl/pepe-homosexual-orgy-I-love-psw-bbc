import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { normalizeValidatedEmailAddress } from "../security/email-address";

export type AuditActor = {
  actorType: "USER" | "OPERATOR" | "SYSTEM";
  actorUserId?: string;
  actorEmail?: string;
  requestId?: string;
};

const auditMetadataKeys = ["reason", "code", "method"] as const;
const redactedMetadataValue = "[REDACTED]";
const allowedMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const allowedReasonReferences = new Set(["manual_review_approved", "ADMIN_REAUTH_REQUIRED"]);
const sensitiveTextMarker =
  /@|(?:^|[^\p{L}\p{N}])(?:authorization|bearer|cookies?|set[\s._-]*cookie|password|token|secret|api[\s._-]*key|body)(?=$|[^\p{L}\p{N}])|\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/iu;
const sixDigitCode = /(?<!\p{Nd})\p{Nd}(?:[^\p{L}\p{N}]*\p{Nd}){5}(?!\p{Nd})/u;

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

function sanitizeReason(value: string) {
  const summary = value.trim();
  const allowedSummary = /^[\p{L}\p{N}][\p{L}\p{N} _.,;!?()'"/+\-]{0,239}$/u;
  if (allowedReasonReferences.has(summary)) return summary;
  if (
    !allowedSummary.test(summary) ||
    sensitiveTextMarker.test(summary) ||
    sixDigitCode.test(summary) ||
    containsOpaqueValue(summary)
  ) {
    return redactedMetadataValue;
  }
  return summary;
}

function containsOpaqueValue(value: string) {
  return (value.match(/[\p{L}\p{N}_+/=.\-]{20,}/gu) ?? []).some((token) => {
    if (/^[a-f0-9]{20,}$/i.test(token)) return true;
    const entropy = shannonEntropy(token);
    return entropy >= 3.5;
  });
}

function shannonEntropy(value: string) {
  const characters = [...value];
  const counts = new Map<string, number>();
  for (const character of characters) counts.set(character, (counts.get(character) ?? 0) + 1);
  return [...counts.values()].reduce((entropy, count) => {
    const probability = count / characters.length;
    return entropy - probability * Math.log2(probability);
  }, 0);
}

function sanitizeTargetId(value: string | undefined) {
  if (value === undefined) return undefined;
  const knownDatabaseId =
    /^c[a-z0-9]{20,31}$/.test(value) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const staticHandlerReference =
    /^[A-Za-z_$][A-Za-z0-9_$]{0,98}\.[A-Za-z_$][A-Za-z0-9_$]{0,98}$/.test(value);
  if (value === value.trim() && knownDatabaseId) return value;
  if (
    value !== value.trim() ||
    !staticHandlerReference ||
    sensitiveTextMarker.test(value) ||
    sixDigitCode.test(value)
  ) {
    return redactedMetadataValue;
  }
  return value;
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
  async append(database: AuditDatabase, input: AuditInput) {
    const actorEmail = input.actorEmail === undefined ? undefined : normalizeValidatedEmailAddress(input.actorEmail);
    if (input.actorEmail !== undefined && !actorEmail) {
      throw new BadRequestException("Audit actor email is invalid");
    }
    return database.auditEvent.create({
      data: {
        actorType: input.actorType,
        actorUserId: input.actorUserId,
        actorEmail,
        action: input.action,
        targetType: input.targetType,
        targetId: sanitizeTargetId(input.targetId),
        outcome: input.outcome,
        requestId: input.requestId,
        metadata: sanitizeMetadata(input.metadata)
      }
    });
  }
}
