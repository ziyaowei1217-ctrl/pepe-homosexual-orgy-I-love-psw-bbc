import { listingMediaUploadAttemptId } from "./listing-media.presentation";
import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import {
  MAX_LISTING_MEDIA_BYTES,
  MAX_LISTING_MEDIA_COUNT,
  SUPPORTED_LISTING_MEDIA_MIME_TYPES,
  type ListingMediaSecurityCode,
  type SupportedListingMediaMimeType
} from "./listing-media.constants";
import type {
  InitializeListingMediaUploadDto,
  ReorderListingMediaDto
} from "./listing-media.dto";
import {
  ListingMediaStorageError,
  type ListingMediaStorage,
  type ListingMediaUploadTarget
} from "./listing-media-storage";
import {
  ListingMediaSecurityError,
  validateListingImage
} from "./listing-media-validation";

const editableListingStatuses = new Set(["DRAFT", "REJECTED"]);
const checksumPattern = /^[a-f0-9]{64}$/;

@Injectable()
export class ListingMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ListingMediaStorage,
    private readonly now: () => Date = () => new Date(),
    private readonly createObjectId: () => string = randomUUID
  ) {}

  async initializeUpload(
    ownerId: string,
    listingId: string,
    input: InitializeListingMediaUploadDto
  ) {
    const normalized = normalizeUploadInput(input);
    if (typeof input.commandId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.commandId)) {
      throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "上传命令标识无效。");
    }
    const commandId = input.commandId.toLowerCase();
    const fingerprint = createHash("sha256").update(JSON.stringify({ ownerId, listingId, ...normalized })).digest("hex");
    await this.requireOwnedListing(this.prisma, ownerId, listingId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Serialize command lookup and creation without changing a replayed
        // listing's reviewed revision. FK inserts can still take KEY SHARE.
        await transaction.$queryRaw`SELECT "id" FROM "Listing" WHERE "id" = ${listingId} FOR NO KEY UPDATE`;
        const listing = await this.requireOwnedListing(transaction, ownerId, listingId);
        const receipt = await transaction.listingMediaInitialization.findUnique({ where: { ownerId_commandId: { ownerId, commandId } } });
        if (receipt) {
          if (receipt.fingerprint !== fingerprint) {
            throw productConflict("LISTING_MEDIA_COMMAND_CONFLICT", "上传命令已用于其他图片或房源。");
          }
          if (!receipt.mediaId) throw productConflict("LISTING_MEDIA_COMMAND_DELETED", "这次上传已被删除，请重新选择图片。");
          const previous = await transaction.listingMedia.findUnique({ where: { id: receipt.mediaId } });
          if (!previous) throw productConflict("LISTING_MEDIA_COMMAND_DELETED", "这次上传已被删除，请重新选择图片。");
          if (editableListingStatuses.has(listing.status) && previous.storageStatus === "PENDING_UPLOAD" && previous.originalKey) {
            const upload = await this.storage.createUploadUrl(previous.originalKey, normalized.mimeType, normalized.sizeBytes);
            const refreshed = await transaction.listingMedia.update({ where: { id: previous.id }, data: { uploadExpiresAt: upload.expiresAt } });
            return { media: refreshed, ...upload, uploadAttemptId: listingMediaUploadAttemptId(previous.originalKey)! };
          }
          return { media: previous, uploadUrl: null, expiresAt: null, uploadAttemptId: listingMediaUploadAttemptId(previous.originalKey)! };
        }

        await this.lockEditableListing(transaction, ownerId, listingId);
        const existing = await transaction.listingMedia.findMany({ where: { listingId }, orderBy: { sortOrder: "asc" } });
        if (existing.length >= MAX_LISTING_MEDIA_COUNT) {
          throw productBadRequest("LISTING_MEDIA_LIMIT_REACHED", "每套房源最多上传 12 张图片。");
        }
        const objectKey = this.objectKey(listingId);
        const upload = await this.storage.createUploadUrl(objectKey, normalized.mimeType, normalized.sizeBytes);
        const media = await transaction.listingMedia.create({ data: {
          listingId,
          url: null,
          kind: normalized.kind,
          sortOrder: existing.length ? Math.max(...existing.map((item) => item.sortOrder)) + 1 : 0,
          originalKey: objectKey,
          mimeType: normalized.mimeType,
          sizeBytes: normalized.sizeBytes,
          checksum: normalized.checksumSha256,
          uploadExpiresAt: upload.expiresAt,
          storageStatus: "PENDING_UPLOAD",
          reviewStatus: "PENDING",
          securityErrorCode: null
        } });
        await transaction.listingMediaInitialization.create({ data: { ownerId, commandId, fingerprint, listingId, mediaId: media.id } });
        return { media, ...upload, uploadAttemptId: listingMediaUploadAttemptId(objectKey)! };
      });
    } catch (error) {
      // Different listings lock different rows, so the unique receipt constraint
      // also rejects concurrent reuse of one owner's command across listings.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw productConflict("LISTING_MEDIA_COMMAND_CONFLICT", "上传命令已用于其他图片或房源。");
      }
      throw error;
    }
  }

  async finalize(ownerId: string, listingId: string, mediaId: string, uploadAttemptId: string) {
    const media = await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    requireUploadAttempt(media.originalKey, uploadAttemptId);
    const started = await this.withEditableListing(ownerId, listingId, (transaction) => transaction.listingMedia.updateMany({
      where: { id: mediaId, listingId, storageStatus: "PENDING_UPLOAD", originalKey: media.originalKey },
      data: {
        storageStatus: "UPLOADED_PENDING_VALIDATION",
        securityErrorCode: null
      }
    }));
    if (started.count !== 1) {
      throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "图片状态已变化，请刷新后重试。");
    }
    if (!media.originalKey || !media.mimeType || !media.sizeBytes || !media.checksum) {
      return this.failValidation(ownerId, listingId, mediaId, "IMAGE_VALIDATION_FAILED");
    }

    let frozenKey: string | undefined;
    let committed = false;
    try {
      const bytes = await this.storage.read(media.originalKey);
      const validated = await validateListingImage(bytes, {
        mimeType: asSupportedMimeType(media.mimeType),
        sizeBytes: media.sizeBytes,
        checksumSha256: media.checksum
      });
      // Freeze the buffer we validated, never a second read/copy of the upload object.
      // This namespace is never used when signing client upload URLs.
      frozenKey = `listing-media-frozen/${listingId}/${randomUUID()}`;
      await this.storage.write(frozenKey, bytes, validated.mimeType);
      const completed = await this.withEditableListing(ownerId, listingId, (transaction) => transaction.listingMedia.updateMany({
        where: {
          id: mediaId,
          listingId,
          storageStatus: "UPLOADED_PENDING_VALIDATION"
        },
        data: {
          storageStatus: "READY",
          processedKey: frozenKey,
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          width: validated.width,
          height: validated.height,
          checksum: validated.checksumSha256,
          securityErrorCode: null,
          finalizedAt: this.now()
        }
      }));
      if (completed.count !== 1) {
        throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "图片状态已变化，请刷新后重试。");
      }
      committed = true;
      return this.requireMedia(mediaId);
    } catch (error) {
      if (frozenKey && !committed) await this.cleanupUnreferencedFrozen(mediaId, frozenKey);
      if (error instanceof ConflictException) throw error;
      return this.failValidation(ownerId, listingId, mediaId, mediaFailureCode(error));
    }
  }

  async retry(ownerId: string, listingId: string, mediaId: string, uploadAttemptId: string) {
    const media = await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    requireUploadAttempt(media.originalKey, uploadAttemptId);
    if (media.storageStatus !== "FAILED" && media.storageStatus !== "PENDING_UPLOAD") {
      throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "只有未完成上传或校验失败的图片可以重试。");
    }
    if (!media.mimeType || !media.sizeBytes || !media.checksum) {
      throw productBadRequest("LISTING_MEDIA_RETRY_UNAVAILABLE", "这张图片无法重试，请删除后重新选择。");
    }

    const objectKey = this.objectKey(listingId);
    const upload = await this.storage.createUploadUrl(
      objectKey,
      asSupportedMimeType(media.mimeType),
      media.sizeBytes
    );
    const retriedMedia = await this.withEditableListing(ownerId, listingId, async (transaction) => {
      const updated = await transaction.listingMedia.updateMany({
        where: { id: mediaId, listingId, storageStatus: media.storageStatus, originalKey: media.originalKey },
        data: {
          originalKey: objectKey,
          processedKey: null,
          publicMainKey: null,
          publicThumbnailKey: null,
          uploadExpiresAt: upload.expiresAt,
          storageStatus: "PENDING_UPLOAD",
          reviewStatus: "PENDING",
          securityErrorCode: null,
          width: null,
          height: null,
          finalizedAt: null,
          publishedAt: null
        }
      });
      if (updated.count !== 1) {
        throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "图片状态已变化，请刷新后重试。");
      }

      const current = await transaction.listingMedia.findUnique({ where: { id: mediaId } });
      if (!current) throw new NotFoundException("Listing media not found");
      return current;
    });

    try {
      await this.deleteObjects(media);
    } catch {
      // The retry is committed and these keys are no longer referenced. Cleanup
      // failure must not hide the new URL and strand the pending upload.
    }
    return { media: retriedMedia, ...upload, uploadAttemptId: listingMediaUploadAttemptId(objectKey)! };
  }

  async findOwned(ownerId: string, listingId: string) {
    await this.requireOwnedListing(this.prisma, ownerId, listingId);
    return this.prisma.listingMedia.findMany({
      where: { listingId },
      include: { initializationReceipt: { select: { commandId: true } } },
      orderBy: { sortOrder: "asc" }
    });
  }

  async readPublished(mediaId: string) {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (
      !media ||
      media.storageStatus !== "PUBLISHED" ||
      !(media.processedKey || media.originalKey) ||
      !media.mimeType ||
      !media.sizeBytes ||
      !(SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(media.mimeType)
    ) {
      throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
    }

    try {
      const bytes = await this.storage.read((media.processedKey || media.originalKey)!);
      if (bytes.length !== media.sizeBytes || !media.checksum ||
          createHash("sha256").update(bytes).digest("hex") !== media.checksum) {
        throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
      }
      return { bytes, mimeType: media.mimeType as SupportedListingMediaMimeType };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ListingMediaStorageError && error.code === "IMAGE_STORAGE_UNAVAILABLE") {
        throw new ServiceUnavailableException({
          code: error.code,
          message: "图片暂时无法读取，请稍后重试。"
        });
      }
      throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
    }
  }

  async readForReview(listingId: string, mediaId: string) {
    const [listing, media] = await Promise.all([
      this.prisma.listing.findUnique({ where: { id: listingId } }),
      this.prisma.listingMedia.findUnique({ where: { id: mediaId } })
    ]);
    if (
      !listing ||
      listing.status !== "SUBMITTED" ||
      !media ||
      media.listingId !== listingId ||
      (media.storageStatus !== "READY" && media.storageStatus !== "PUBLISHED") ||
      !(media.processedKey || media.originalKey) ||
      !media.mimeType ||
      !media.sizeBytes ||
      !(SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(media.mimeType)
    ) {
      throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
    }

    try {
      const bytes = await this.storage.read((media.processedKey || media.originalKey)!);
      if (bytes.length !== media.sizeBytes || !media.checksum ||
          createHash("sha256").update(bytes).digest("hex") !== media.checksum) {
        throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
      }
      return { bytes, mimeType: media.mimeType as SupportedListingMediaMimeType };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      if (error instanceof ListingMediaStorageError && error.code === "IMAGE_STORAGE_UNAVAILABLE") {
        throw new ServiceUnavailableException({
          code: error.code,
          message: "图片暂时无法读取，请稍后重试。"
        });
      }
      throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
    }
  }

  async reorder(ownerId: string, listingId: string, input: ReorderListingMediaDto) {
    await this.requireEditableListing(this.prisma, ownerId, listingId);
    const ids = input.mediaIds;
    if (
      ids.length < 1 ||
      ids.length > MAX_LISTING_MEDIA_COUNT ||
      new Set(ids).size !== ids.length
    ) {
      throw productBadRequest("LISTING_MEDIA_ORDER_INVALID", "图片排序必须包含每张图片且不能重复。");
    }

    await this.withEditableListing(ownerId, listingId, async (transaction) => {
      const existing = await transaction.listingMedia.findMany({
        where: { listingId },
        orderBy: { sortOrder: "asc" }
      });
      const existingIds = new Set(existing.map((item) => item.id));
      if (existing.length !== ids.length || ids.some((id) => !existingIds.has(id))) {
        throw productBadRequest("LISTING_MEDIA_ORDER_INVALID", "图片排序必须包含每张图片且不能重复。");
      }
      for (const [sortOrder, id] of ids.entries()) {
        await transaction.listingMedia.update({ where: { id }, data: { sortOrder } });
      }
    });
    return this.findOwned(ownerId, listingId);
  }

  async remove(ownerId: string, listingId: string, mediaId: string) {
    await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    const media = await this.withEditableListing(ownerId, listingId, (transaction) =>
      transaction.listingMedia.delete({ where: { id: mediaId } })
    );
    await this.deleteObjects(media);
    return { removed: true };
  }

  private async deleteObjects(media: { originalKey: string | null; processedKey: string | null; publicMainKey: string | null; publicThumbnailKey: string | null }) {
    const keys = new Set([media.originalKey, media.processedKey, media.publicMainKey, media.publicThumbnailKey]);
    await Promise.all([...keys].filter((key): key is string => Boolean(key)).map((key) => this.storage.delete(key)));
  }

  private async cleanupUnreferencedFrozen(mediaId: string, key: string) {
    try {
      // A commit response can be lost. Never remove a key the database references,
      // including one already published while this request was finishing.
      const current = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
      if (current && [current.processedKey, current.publicMainKey, current.publicThumbnailKey].includes(key)) return;
      await this.storage.delete(key);
    } catch {
      // Fail closed on uncertain DB/storage state; an orphan is safer than data loss.
    }
  }

  private async failValidation(ownerId: string, listingId: string, mediaId: string, code: ListingMediaSecurityCode) {
    const failedAt = this.now();
    await this.withEditableListing(ownerId, listingId, (transaction) => transaction.listingMedia.updateMany({
      where: { id: mediaId, storageStatus: "UPLOADED_PENDING_VALIDATION" },
      data: {
        storageStatus: "FAILED",
        securityErrorCode: code,
        finalizedAt: failedAt
      }
    }));
    return this.requireMedia(mediaId);
  }

  private async withEditableListing<T>(
    ownerId: string,
    listingId: string,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>
  ) {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockEditableListing(transaction, ownerId, listingId);
      return operation(transaction);
    });
  }

  private async lockEditableListing(
    transaction: Pick<Prisma.TransactionClient, "listing">,
    ownerId: string,
    listingId: string
  ) {
    // Independent photo operations can wait for the same listing row without
    // invalidating each other. The editable-state predicate is rechecked after
    // waiting, and the row stays locked until the media transaction commits.
    const locked = await transaction.listing.updateMany({
      where: { id: listingId, ownerId, status: { in: ["DRAFT", "REJECTED"] } },
      data: { revision: { increment: 1 } }
    });
    if (locked.count !== 1) {
      await this.requireEditableListing(transaction, ownerId, listingId);
      throw productConflict("LISTING_MEDIA_LOCKED", "房源已变化，请刷新后重试。");
    }
  }

  private async requireOwnedEditableMedia(ownerId: string, listingId: string, mediaId: string) {
    await this.requireEditableListing(this.prisma, ownerId, listingId);
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.listingId !== listingId) throw new NotFoundException("Listing media not found");
    return media;
  }

  private async requireMedia(mediaId: string) {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException("Listing media not found");
    return media;
  }

  private async requireOwnedListing(
    client: Pick<Prisma.TransactionClient, "listing">,
    ownerId: string,
    listingId: string
  ) {
    const listing = await client.listing.findUnique({ where: { id: listingId } });
    if (!listing || listing.ownerId !== ownerId) throw new NotFoundException("Listing not found");
    return listing;
  }

  private async requireEditableListing(
    client: Pick<Prisma.TransactionClient, "listing">,
    ownerId: string,
    listingId: string
  ) {
    const listing = await this.requireOwnedListing(client, ownerId, listingId);
    if (!editableListingStatuses.has(listing.status)) {
      throw productConflict("LISTING_MEDIA_LOCKED", "房源提交审核后，图片将被锁定。");
    }
    return listing;
  }

  private objectKey(listingId: string) {
    return `listing-media/${listingId}/${this.createObjectId()}`;
  }
}

function normalizeUploadInput(input: InitializeListingMediaUploadDto) {
  const kind = input.kind?.trim();
  const checksumSha256 = input.checksumSha256?.trim().toLowerCase();
  if (!kind || kind.length > 40) {
    throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "请选择图片分类。");
  }
  if (!(SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "仅支持 JPEG、PNG 和 WebP 图片。");
  }
  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > MAX_LISTING_MEDIA_BYTES) {
    throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "单张图片不能超过 10 MB。");
  }
  if (!checksumSha256 || !checksumPattern.test(checksumSha256)) {
    throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "图片校验和格式无效。");
  }
  return {
    kind,
    mimeType: input.mimeType as SupportedListingMediaMimeType,
    sizeBytes: input.sizeBytes,
    checksumSha256
  };
}

function asSupportedMimeType(value: string): SupportedListingMediaMimeType {
  if (!(SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(value)) {
    throw new ListingMediaSecurityError("IMAGE_TYPE_UNSUPPORTED");
  }
  return value as SupportedListingMediaMimeType;
}

function mediaFailureCode(error: unknown): ListingMediaSecurityCode {
  if (error instanceof ListingMediaSecurityError || error instanceof ListingMediaStorageError) {
    return error.code;
  }
  return "IMAGE_VALIDATION_FAILED";
}

function productBadRequest(code: string, message: string) {
  return new BadRequestException({ code, message });
}

function productConflict(code: string, message: string) {
  return new ConflictException({ code, message });
}

function productNotFound(code: string, message: string) {
  return new NotFoundException({ code, message });
}

function requireUploadAttempt(originalKey: string | null, attemptId: string) {
  if (typeof attemptId !== "string" || !checksumPattern.test(attemptId)) {
    throw productBadRequest("LISTING_MEDIA_INPUT_INVALID", "请刷新后重试图片上传。");
  }
  if (attemptId !== listingMediaUploadAttemptId(originalKey)) {
    throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "上传已更新，请刷新后重试。");
  }
}
