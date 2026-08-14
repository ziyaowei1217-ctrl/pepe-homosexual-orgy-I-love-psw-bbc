import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import {
  MAX_LISTING_MEDIA_BYTES,
  MAX_LISTING_MEDIA_PIXELS,
  SUPPORTED_LISTING_MEDIA_MIME_TYPES,
  type ListingMediaSecurityCode,
  type SupportedListingMediaMimeType
} from "./listing-media.constants";

export type ListingImageExpectation = {
  mimeType: SupportedListingMediaMimeType;
  sizeBytes: number;
  checksumSha256: string;
};

export type ValidatedListingImage = {
  mimeType: SupportedListingMediaMimeType;
  sizeBytes: number;
  width: number;
  height: number;
  checksumSha256: string;
};

export class ListingMediaSecurityError extends Error {
  constructor(readonly code: ListingMediaSecurityCode) {
    super(code);
    this.name = "ListingMediaSecurityError";
  }
}

export async function validateListingImage(
  bytes: Buffer,
  expected: ListingImageExpectation
): Promise<ValidatedListingImage> {
  if (bytes.length > MAX_LISTING_MEDIA_BYTES) {
    throw new ListingMediaSecurityError("IMAGE_TOO_LARGE");
  }
  if (bytes.length !== expected.sizeBytes) {
    throw new ListingMediaSecurityError("IMAGE_SIZE_MISMATCH");
  }

  const detected = await detectType(bytes);
  if (!detected || !isSupportedMimeType(detected.mime)) {
    throw new ListingMediaSecurityError("IMAGE_TYPE_UNSUPPORTED");
  }
  if (detected.mime !== expected.mimeType) {
    throw new ListingMediaSecurityError("IMAGE_CONTENT_TYPE_MISMATCH");
  }

  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  if (checksumSha256 !== expected.checksumSha256.toLowerCase()) {
    throw new ListingMediaSecurityError("IMAGE_CHECKSUM_MISMATCH");
  }

  const dimensions = await readDimensions(bytes);
  return {
    mimeType: detected.mime,
    sizeBytes: bytes.length,
    width: dimensions.width,
    height: dimensions.height,
    checksumSha256
  };
}

async function detectType(bytes: Buffer) {
  try {
    return await fileTypeFromBuffer(bytes);
  } catch {
    return undefined;
  }
}

function isSupportedMimeType(value: string): value is SupportedListingMediaMimeType {
  return (SUPPORTED_LISTING_MEDIA_MIME_TYPES as readonly string[]).includes(value);
}

async function readDimensions(bytes: Buffer) {
  try {
    const metadata = await sharp(bytes, { limitInputPixels: MAX_LISTING_MEDIA_PIXELS }).metadata();
    if (!metadata.width || !metadata.height) {
      throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
    }
    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof ListingMediaSecurityError) throw error;
    throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
  }
}
