export const MAX_LISTING_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_LISTING_MEDIA_PIXELS = 40_000_000;

export const SUPPORTED_LISTING_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp"
] as const;

export type SupportedListingMediaMimeType = (typeof SUPPORTED_LISTING_MEDIA_MIME_TYPES)[number];

export const LISTING_MEDIA_SECURITY_CODES = [
  "IMAGE_TOO_LARGE",
  "IMAGE_SIZE_MISMATCH",
  "IMAGE_TYPE_UNSUPPORTED",
  "IMAGE_CONTENT_TYPE_MISMATCH",
  "IMAGE_CHECKSUM_MISMATCH",
  "IMAGE_DIMENSIONS_UNSAFE",
  "IMAGE_OBJECT_MISSING",
  "IMAGE_STORAGE_UNAVAILABLE",
  "IMAGE_VALIDATION_FAILED"
] as const;

export type ListingMediaSecurityCode = (typeof LISTING_MEDIA_SECURITY_CODES)[number];
