import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  MAX_LISTING_MEDIA_BYTES,
  MAX_LISTING_MEDIA_CHANNELS,
  MAX_LISTING_MEDIA_DECODED_BYTES,
  MAX_LISTING_MEDIA_PARSE_MS,
  MAX_LISTING_MEDIA_PIXELS,
  type ListingMediaSecurityCode,
  type SupportedListingMediaMimeType
} from "./listing-media.constants";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from("RIFF", "ascii");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");
const SHARP_TIMEOUT_SECONDS = Math.ceil(MAX_LISTING_MEDIA_PARSE_MS / 1_000);

sharp.block({ operation: ["VipsForeignLoad"] });
sharp.unblock({
  operation: [
    "VipsForeignLoadJpegBuffer",
    "VipsForeignLoadPngBuffer",
    "VipsForeignLoadWebpBuffer"
  ]
});

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

  const detectedMimeType = detectAllowedMimeType(bytes);
  if (!detectedMimeType) {
    throw new ListingMediaSecurityError("IMAGE_TYPE_UNSUPPORTED");
  }
  if (detectedMimeType !== expected.mimeType) {
    throw new ListingMediaSecurityError("IMAGE_CONTENT_TYPE_MISMATCH");
  }

  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  if (checksumSha256 !== expected.checksumSha256.toLowerCase()) {
    throw new ListingMediaSecurityError("IMAGE_CHECKSUM_MISMATCH");
  }

  const dimensions = await readDimensions(bytes, detectedMimeType);
  return {
    mimeType: detectedMimeType,
    sizeBytes: bytes.length,
    width: dimensions.width,
    height: dimensions.height,
    checksumSha256
  };
}

function detectAllowedMimeType(bytes: Buffer): SupportedListingMediaMimeType | undefined {
  if (bytes.length >= JPEG_SIGNATURE.length && bytes.subarray(0, 3).equals(JPEG_SIGNATURE)) {
    return "image/jpeg";
  }
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).equals(RIFF_SIGNATURE) &&
    bytes.subarray(8, 12).equals(WEBP_SIGNATURE) &&
    bytes.readUInt32LE(4) === bytes.length - 8
  ) {
    return "image/webp";
  }
  return undefined;
}

async function readDimensions(bytes: Buffer, mimeType: SupportedListingMediaMimeType) {
  const deadline = Date.now() + MAX_LISTING_MEDIA_PARSE_MS;
  try {
    const metadata = await beforeDeadline(
      sharp(bytes, {
        failOn: "warning",
        limitInputPixels: MAX_LISTING_MEDIA_PIXELS,
        limitInputChannels: MAX_LISTING_MEDIA_CHANNELS,
        pages: 1
      })
        .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
        .metadata(),
      deadline
    );
    if (
      !isPositiveSafeInteger(metadata.width) ||
      !isPositiveSafeInteger(metadata.height) ||
      !isPositiveSafeInteger(metadata.channels) ||
      metadata.channels > MAX_LISTING_MEDIA_CHANNELS ||
      (metadata.pages ?? 1) !== 1 ||
      metadata.format !== formatForMimeType(mimeType)
    ) {
      throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
    }

    const sampleBytes = bytesPerSample(metadata.depth);
    if (sampleBytes === undefined) {
      throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
    }
    const pixels = metadata.width * metadata.height;
    const decodedBytes = pixels * metadata.channels * sampleBytes;
    if (
      !Number.isSafeInteger(pixels) ||
      pixels > MAX_LISTING_MEDIA_PIXELS ||
      !Number.isSafeInteger(decodedBytes) ||
      decodedBytes > MAX_LISTING_MEDIA_DECODED_BYTES
    ) {
      throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
    }

    const decodedProbe = await beforeDeadline(
      sharp(bytes, {
        failOn: "warning",
        limitInputPixels: MAX_LISTING_MEDIA_PIXELS,
        limitInputChannels: MAX_LISTING_MEDIA_CHANNELS,
        pages: 1
      })
        .resize(1, 1, { fit: "fill" })
        .raw()
        .timeout({ seconds: SHARP_TIMEOUT_SECONDS })
        .toBuffer(),
      deadline
    );
    if (decodedProbe.length > MAX_LISTING_MEDIA_CHANNELS) {
      throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
    }

    return { width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof ListingMediaSecurityError) throw error;
    throw new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE");
  }
}

function formatForMimeType(mimeType: SupportedListingMediaMimeType) {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

function bytesPerSample(depth: string | undefined) {
  if (depth === "uchar") return 1;
  if (depth === "ushort") return 2;
  return undefined;
}

function isPositiveSafeInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0;
}

function beforeDeadline<T>(work: Promise<T>, deadline: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const remainingMs = Math.max(0, deadline - Date.now());
    const timeout = setTimeout(
      () => reject(new ListingMediaSecurityError("IMAGE_DIMENSIONS_UNSAFE")),
      remainingMs
    );
    work.then(
      (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
