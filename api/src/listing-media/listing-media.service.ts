import { randomUUID } from "node:crypto";

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
    await this.requireEditableListing(this.prisma, ownerId, listingId);

    const objectKey = this.objectKey(listingId);
    const upload = await this.storage.createUploadUrl(
      objectKey,
      normalized.mimeType,
      normalized.sizeBytes
    );

    const media = await this.prisma.$transaction(
      async (transaction) => {
        await this.requireEditableListing(transaction, ownerId, listingId);
        const existing = await transaction.listingMedia.findMany({
          where: { listingId },
          orderBy: { sortOrder: "asc" }
        });
        if (existing.length >= MAX_LISTING_MEDIA_COUNT) {
          throw productBadRequest(
            "LISTING_MEDIA_LIMIT_REACHED",
            "每套房源最多上传 12 张图片。"
          );
        }
        const nextSortOrder = existing.length
          ? Math.max(...existing.map((item) => item.sortOrder)) + 1
          : 0;

        return transaction.listingMedia.create({
          data: {
            listingId,
            url: null,
            kind: normalized.kind,
            sortOrder: nextSortOrder,
            originalKey: objectKey,
            mimeType: normalized.mimeType,
            sizeBytes: normalized.sizeBytes,
            checksum: normalized.checksumSha256,
            uploadExpiresAt: upload.expiresAt,
            storageStatus: "PENDING_UPLOAD",
            reviewStatus: "PENDING",
            securityErrorCode: null
          }
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    return { media, ...upload };
  }

  async finalize(ownerId: string, listingId: string, mediaId: string) {
    const media = await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    const started = await this.prisma.listingMedia.updateMany({
      where: { id: mediaId, listingId, storageStatus: "PENDING_UPLOAD" },
      data: {
        storageStatus: "UPLOADED_PENDING_VALIDATION",
        securityErrorCode: null
      }
    });
    if (started.count !== 1) {
      throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "图片状态已变化，请刷新后重试。");
    }
    if (!media.originalKey || !media.mimeType || !media.sizeBytes || !media.checksum) {
      return this.failValidation(mediaId, "IMAGE_VALIDATION_FAILED");
    }

    try {
      const bytes = await this.storage.read(media.originalKey);
      const validated = await validateListingImage(bytes, {
        mimeType: asSupportedMimeType(media.mimeType),
        sizeBytes: media.sizeBytes,
        checksumSha256: media.checksum
      });
      const completed = await this.prisma.listingMedia.updateMany({
        where: {
          id: mediaId,
          listingId,
          storageStatus: "UPLOADED_PENDING_VALIDATION"
        },
        data: {
          storageStatus: "READY",
          mimeType: validated.mimeType,
          sizeBytes: validated.sizeBytes,
          width: validated.width,
          height: validated.height,
          checksum: validated.checksumSha256,
          securityErrorCode: null,
          finalizedAt: this.now()
        }
      });
      if (completed.count !== 1) {
        throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "图片状态已变化，请刷新后重试。");
      }
      return this.requireMedia(mediaId);
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      return this.failValidation(mediaId, mediaFailureCode(error));
    }
  }

  async retry(ownerId: string, listingId: string, mediaId: string) {
    const media = await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    if (media.storageStatus !== "FAILED") {
      throw productConflict("LISTING_MEDIA_STATE_CONFLICT", "只有校验失败的图片可以重试。");
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
    if (media.originalKey) await this.storage.delete(media.originalKey);

    const updated = await this.prisma.listingMedia.updateMany({
      where: { id: mediaId, listingId, storageStatus: "FAILED" },
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

    return { media: await this.requireMedia(mediaId), ...upload };
  }

  async findOwned(ownerId: string, listingId: string) {
    await this.requireOwnedListing(this.prisma, ownerId, listingId);
    return this.prisma.listingMedia.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" }
    });
  }

  async readPublished(mediaId: string) {
    const media = await this.prisma.listingMedia.findUnique({ where: { id: mediaId } });
    if (
      !media ||
      media.storageStatus !== "PUBLISHED" ||
      !media.originalKey ||
      !media.mimeType ||
      !media.sizeBytes ||
      !(SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(media.mimeType)
    ) {
      throw productNotFound("LISTING_MEDIA_NOT_AVAILABLE", "Listing media not available");
    }

    try {
      const bytes = await this.storage.read(media.originalKey);
      if (bytes.length !== media.sizeBytes) {
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

    const existing = await this.prisma.listingMedia.findMany({
      where: { listingId },
      orderBy: { sortOrder: "asc" }
    });
    const existingIds = new Set(existing.map((item) => item.id));
    if (existing.length !== ids.length || ids.some((id) => !existingIds.has(id))) {
      throw productBadRequest("LISTING_MEDIA_ORDER_INVALID", "图片排序必须包含每张图片且不能重复。");
    }

    await this.prisma.$transaction(async (transaction) => {
      await this.requireEditableListing(transaction, ownerId, listingId);
      for (const [sortOrder, id] of ids.entries()) {
        await transaction.listingMedia.update({ where: { id }, data: { sortOrder } });
      }
    });
    return this.findOwned(ownerId, listingId);
  }

  async remove(ownerId: string, listingId: string, mediaId: string) {
    const media = await this.requireOwnedEditableMedia(ownerId, listingId, mediaId);
    await this.prisma.listingMedia.delete({ where: { id: mediaId } });
    if (media.originalKey) await this.storage.delete(media.originalKey);
    return { removed: true };
  }

  private async failValidation(mediaId: string, code: ListingMediaSecurityCode) {
    const failedAt = this.now();
    await this.prisma.listingMedia.updateMany({
      where: { id: mediaId, storageStatus: "UPLOADED_PENDING_VALIDATION" },
      data: {
        storageStatus: "FAILED",
        securityErrorCode: code,
        finalizedAt: failedAt
      }
    });
    return this.requireMedia(mediaId);
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
