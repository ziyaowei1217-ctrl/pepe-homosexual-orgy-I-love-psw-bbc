import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  MAX_LISTING_MEDIA_BYTES,
  MAX_LISTING_MEDIA_DECODED_BYTES,
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

  it.each([
    ["truncated JPEG", Buffer.from([0xff, 0xd8])],
    ["truncated PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])],
    ["truncated WebP", Buffer.from("RIFF\u0000\u0000\u0000\u0000WEB", "binary")],
    ["forged WebP container length", Buffer.from("RIFF\u0000\u0000\u0000\u0000WEBP", "binary")]
  ])("rejects %s before image parsing", async (_name, bytes) => {
    await expect(validateListingImage(bytes, expected(bytes, "image/webp"))).rejects.toMatchObject({
      code: "IMAGE_TYPE_UNSUPPORTED"
    });
  });

  it("rejects a bounded ZIP without decoding its compressed entry", async () => {
    const bytes = boundedContentTypesZip();
    let maxDecodedBytes = 0;
    const originalDecode = TextDecoder.prototype.decode;
    TextDecoder.prototype.decode = function (input, options) {
      maxDecodedBytes = Math.max(maxDecodedBytes, input?.byteLength ?? 0);
      return originalDecode.call(this, input, options);
    };

    try {
      await expect(validateListingImage(bytes, expected(bytes, "image/png"))).rejects.toMatchObject({
        code: "IMAGE_TYPE_UNSUPPORTED"
      });
      expect(bytes.length).toBeLessThan(20_000);
      expect(maxDecodedBytes).toBe(0);
    } finally {
      TextDecoder.prototype.decode = originalDecode;
    }
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

  it("rejects an animated image even when its first frame is within the pixel ceiling", async () => {
    const bytes = await animatedWebpBytes();

    await expect(validateListingImage(bytes, expected(bytes, "image/webp"))).rejects.toMatchObject({
      code: "IMAGE_DIMENSIONS_UNSAFE"
    });
  });

  it("rejects an image whose decoded pixels exceed the output-memory budget", async () => {
    const width = 5_900;
    const height = 5_900;
    expect(width * height * 4).toBeGreaterThan(MAX_LISTING_MEDIA_DECODED_BYTES);
    const bytes = await imageBytes("png", width, height);

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

async function animatedWebpBytes() {
  const width = 2;
  const height = 2;
  const channels = 4;
  const frameBytes = width * height * channels;
  return sharp(Buffer.concat([Buffer.alloc(frameBytes, 0xff), Buffer.alloc(frameBytes, 0x22)]), {
    raw: { width, height: height * 2, channels, pageHeight: height },
    animated: true
  })
    .webp({ delay: [100, 100], loop: 0 })
    .toBuffer();
}

function boundedContentTypesZip() {
  const fileName = Buffer.from("[Content_Types].xml");
  const prefix = Buffer.from(
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  );
  const content = Buffer.concat([prefix, Buffer.alloc(16 * 1024 * 1024 - prefix.length, 0x20)]);
  const compressed = deflateRawSync(content, { level: 9 });
  const checksum = crc32(content);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(fileName.length, 26);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(fileName.length, 28);

  const centralOffset = local.length + fileName.length + compressed.length;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + fileName.length, 12);
  end.writeUInt32LE(centralOffset, 16);

  return Buffer.concat([local, fileName, compressed, central, fileName, end]);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
