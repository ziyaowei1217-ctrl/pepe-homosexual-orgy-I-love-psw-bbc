import { BadRequestException } from "@nestjs/common";

export const DEAL_MESSAGE_PREVIEW_LIMIT = 50;
export const DEAL_VIEWING_PREVIEW_LIMIT = 50;

export type DealHistoryCursor = { createdAt: Date; id: string };

export function encodeDealHistoryCursor(cursor: DealHistoryCursor) {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), "utf8").toString("base64url");
}

function decodeDealHistoryCursor(value: unknown): DealHistoryCursor {
  try {
    if (typeof value !== "string" || value.length > 512 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    if (Buffer.from(decoded, "utf8").toString("base64url") !== value) throw new Error();
    const parsed = JSON.parse(decoded) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string" || !parsed.id || parsed.id.length > 120) throw new Error();
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== parsed.createdAt) throw new Error();
    return { createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Invalid deal message cursor");
  }
}

// Call only after authorizing the requested thread; malformed history queries
// must not reveal whether another user's conversation exists.
export function parseDealMessageHistoryQuery(query: Record<string, unknown> = {}) {
  if (Object.keys(query).some(key => key !== "cursor" && key !== "limit")) {
    throw new BadRequestException("Invalid deal message history query");
  }
  const rawLimit = query.limit ?? DEAL_MESSAGE_PREVIEW_LIMIT;
  if ((typeof rawLimit !== "number" && typeof rawLimit !== "string") ||
      (typeof rawLimit === "string" && !/^[1-9][0-9]{0,2}$/.test(rawLimit))) {
    throw new BadRequestException("Deal message limit must be between 1 and 100");
  }
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new BadRequestException("Deal message limit must be between 1 and 100");
  }
  return { limit, cursor: query.cursor === undefined ? null : decodeDealHistoryCursor(query.cursor) };
}

export function historyBefore(cursor: DealHistoryCursor | null) {
  return cursor ? {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { lt: cursor.id } }
    ]
  } : {};
}

export function chronologicalHistoryPage<T extends DealHistoryCursor>(rows: T[], limit: number) {
  const latest = [...rows].sort((left, right) =>
    right.createdAt.getTime() - left.createdAt.getTime() || (left.id < right.id ? 1 : left.id > right.id ? -1 : 0)
  ).slice(0, limit + 1);
  const hasMore = latest.length > limit;
  const messages = latest.slice(0, limit).reverse();
  return { messages, nextCursor: hasMore ? encodeDealHistoryCursor(messages[0]) : null, hasMore };
}
