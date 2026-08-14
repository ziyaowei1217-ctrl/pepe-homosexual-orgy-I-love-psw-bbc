import { createHash } from "node:crypto";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_LISTING_MEDIA_BYTES,
  type SupportedListingMediaMimeType
} from "../src/listing-media/listing-media.constants";
import { validateListingImage } from "../src/listing-media/listing-media-validation";

describe("listing image byte validation", () => {
  it.each([
    ["jpeg", "image/jpeg"],
    ["png", "image/png"],
    ["webp", "image/webp"]
  ] as const)("accepts a real %s and returns server-derived metadata", async (format, mimeType) => {
    const bytes = await imageBytes(format, 2, 3);

    await expect(validateListingImage(bytes, expected(bytes, mimeType))).resolves.toEqual({
      mimeType,
      sizeBytes: bytes.length,
      width: 2,
      height: 3,
      checksumSha256: sha256(bytes)
    });
  });

  it("rejects bytes above 10 MB before attempting image decoding", async () => {
    const bytes = Buffer.alloc(MAX_LISTING_MEDIA_BYTES + 1);

    await expect(validateListingImage(bytes, expected(bytes, "image/png"))).rejects.toMatchObject({
      code: "IMAGE_TOO_LARGE"
    });
  });

  it("rejects a stored byte length that differs from the upload declaration", async () => {
    const bytes = await imageBytes("png", 2, 3);

    await expect(
      validateListingImage(bytes, { ...expected(bytes, "image/png"), sizeBytes: bytes.length + 1 })
    ).rejects.toMatchObject({ code: "IMAGE_SIZE_MISMATCH" });
  });

  it("rejects unsupported magic bytes even when the browser claimed PNG", async () => {
    const bytes = Buffer.from("not an image", "utf8");

    await expect(validateListingImage(bytes, expected(bytes, "image/png"))).rejects.toMatchObject({
      code: "IMAGE_TYPE_UNSUPPORTED"
    });
  });

  it("rejects a real image whose detected type differs from the browser declaration", async () => {
    const bytes = await imageBytes("png", 2, 3);

    await expect(validateListingImage(bytes, expected(bytes, "image/jpeg"))).rejects.toMatchObject({
      code: "IMAGE_CONTENT_TYPE_MISMATCH"
    });
  });

  it("rejects a checksum mismatch using the checksum calculated from stored bytes", async () => {
    const bytes = await imageBytes("webp", 2, 3);

    await expect(
      validateListingImage(bytes, {
        ...expected(bytes, "image/webp"),
        checksumSha256: "0".repeat(64)
      })
    ).rejects.toMatchObject({ code: "IMAGE_CHECKSUM_MISMATCH" });
  });

  it("maps a recognized but malformed image to a stable dimensions error", async () => {
    const complete = await imageBytes("png", 2, 3);
    const truncated = complete.subarray(0, 24);

    await expect(validateListingImage(truncated, expected(truncated, "image/png"))).rejects.toMatchObject({
      code: "IMAGE_DIMENSIONS_UNSAFE"
    });
  });

  it("rejects a decodable image above the 40-megapixel input ceiling", async () => {
    const bytes = await imageBytes("png", 6_500, 6_500);

    await expect(validateListingImage(bytes, expected(bytes, "image/png"))).rejects.toMatchObject({
      code: "IMAGE_DIMENSIONS_UNSAFE"
    });
  }, 15_000);
});

async function imageBytes(format: "jpeg" | "png" | "webp", width: number, height: number) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 42, g: 96, b: 160, alpha: 1 }
    }
  })
    .toFormat(format)
    .toBuffer();
}

function expected(bytes: Buffer, mimeType: SupportedListingMediaMimeType) {
  return {
    mimeType,
    sizeBytes: bytes.length,
    checksumSha256: sha256(bytes)
  };
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}
