import { createHash } from "node:crypto";

export type ListingMediaPresentationSource = {
  id: string;
  initializationReceipt?: unknown;
  storageStatus: string;
  url: unknown;
  originalKey: unknown;
  processedKey: unknown;
  publicMainKey: unknown;
  publicThumbnailKey: unknown;
};

export function presentListingMedia<T extends ListingMediaPresentationSource>(media: T) {
  const {
    initializationReceipt: _initializationReceipt,
    url: _url,
    originalKey: _originalKey,
    processedKey: _processedKey,
    publicMainKey: _publicMainKey,
    publicThumbnailKey: _publicThumbnailKey,
    ...response
  } = media;

  return media.storageStatus === "PUBLISHED"
    ? { ...response, contentUrl: `/api/v1/listing-media/${media.id}/content` }
    : { ...response, uploadAttemptId: listingMediaUploadAttemptId(media.originalKey) };
}

export function listingMediaUploadAttemptId(originalKey: unknown): string | null {
  return typeof originalKey === "string" && originalKey
    ? createHash("sha256").update(`listing-media-attempt:${originalKey}`).digest("hex")
    : null;
}
