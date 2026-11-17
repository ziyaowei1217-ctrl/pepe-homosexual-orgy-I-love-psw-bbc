import { ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { Prisma, type UserDocument } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  MAX_USER_DOCUMENT_BYTES,
  normalizeUserDocument,
  UserDocumentTooLargeError,
  userDocumentKind,
  userDocumentSlug,
  userDocumentSlugs,
  type UserDocumentSlug
} from "./user-document-values";

export type PresentedUserDocument = { revision: number; value: Record<string, unknown>; updatedAt: string };

/**
 * One JSON document per account and kind. Each write names the revision it was based on; a write based
 * on an older revision gets 409 DOCUMENT_CONFLICT, and the client reloads, merges and writes again.
 */
@Injectable()
export class UserDocumentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<Record<UserDocumentSlug, PresentedUserDocument | null>> {
    const rows = await this.prisma.userDocument.findMany({ where: { userId } });
    const documents = Object.fromEntries(userDocumentSlugs.map((slug) => [slug, null])) as Record<UserDocumentSlug, PresentedUserDocument | null>;
    for (const row of rows) documents[userDocumentSlug(row.kind)] = present(row);
    return documents;
  }

  async put(userId: string, slug: string, input: unknown, baseRevision: number): Promise<PresentedUserDocument> {
    const kind = userDocumentKind(slug);
    if (!kind) throw new NotFoundException();
    let value: Record<string, unknown>;
    try {
      value = normalizeUserDocument(kind, input);
    } catch (error) {
      if (error instanceof UserDocumentTooLargeError) throw documentTooLarge();
      throw error;
    }
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_USER_DOCUMENT_BYTES) throw documentTooLarge();

    const data = value as Prisma.InputJsonObject;
    try {
      const row = baseRevision === 0
        ? await this.prisma.userDocument.create({ data: { userId, kind, revision: 1, value: data } })
        : await this.prisma.userDocument.update({
            where: { userId_kind: { userId, kind }, revision: baseRevision },
            data: { value: data, revision: baseRevision + 1 }
          });
      return present(row);
    } catch (error) {
      // P2002: a first write lost to another first write. P2025: the revision moved on (or the document is gone).
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2025")) {
        throw new ConflictException({ statusCode: 409, error: "Conflict", code: "DOCUMENT_CONFLICT", message: "Document changed; reload and retry" });
      }
      throw error;
    }
  }
}

function documentTooLarge() {
  return new PayloadTooLargeException({ statusCode: 413, error: "Payload Too Large", code: "DOCUMENT_TOO_LARGE", message: "Document is too large" });
}

function present(row: Pick<UserDocument, "revision" | "value" | "updatedAt">): PresentedUserDocument {
  const value = typeof row.value === "object" && row.value !== null && !Array.isArray(row.value) ? row.value as Record<string, unknown> : {};
  return { revision: row.revision, value, updatedAt: row.updatedAt.toISOString() };
}
