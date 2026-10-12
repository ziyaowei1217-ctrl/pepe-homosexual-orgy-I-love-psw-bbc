import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

const sharpMock = vi.hoisted(() => {
  const metadata = vi.fn();
  const pipeline = {
    timeout: vi.fn(),
    metadata,
    resize: vi.fn(),
    raw: vi.fn(),
    toBuffer: vi.fn()
  };
  pipeline.timeout.mockReturnValue(pipeline);
  pipeline.resize.mockReturnValue(pipeline);
  pipeline.raw.mockReturnValue(pipeline);
  return {
    factory: Object.assign(vi.fn(() => pipeline), {
      block: vi.fn(),
      unblock: vi.fn()
    }),
    metadata,
    timeout: pipeline.timeout
  };
});

vi.mock("sharp", () => ({ default: sharpMock.factory }));

import { MAX_LISTING_MEDIA_PARSE_MS } from "../src/listing-media/listing-media.constants";
import { validateListingImage } from "../src/listing-media/listing-media-validation";

describe("listing image parser deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fails closed when image metadata parsing does not settle before the wall-clock deadline", async () => {
    vi.useFakeTimers();
    sharpMock.metadata.mockReturnValue(new Promise(() => undefined));
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);
    const validation = validateListingImage(bytes, {
      mimeType: "image/jpeg",
      sizeBytes: bytes.length,
      checksumSha256: createHash("sha256").update(bytes).digest("hex")
    }).then(
      () => "ACCEPTED",
      (error: { code?: string }) => error.code ?? "UNKNOWN_ERROR"
    );

    await vi.advanceTimersByTimeAsync(MAX_LISTING_MEDIA_PARSE_MS + 1);

    await expect(Promise.race([validation, Promise.resolve("PENDING")])).resolves.toBe(
      "IMAGE_DIMENSIONS_UNSAFE"
    );
    expect(sharpMock.timeout).toHaveBeenCalledWith({
      seconds: Math.ceil(MAX_LISTING_MEDIA_PARSE_MS / 1_000)
    });
  });

  it("fails closed when the decoder reports an unknown sample depth", async () => {
    sharpMock.metadata.mockResolvedValue({
      width: 1,
      height: 1,
      channels: 3,
      pages: 1,
      format: "jpeg",
      depth: undefined
    });
    sharpMock.factory().toBuffer.mockResolvedValue(Buffer.alloc(3));
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);

    await expect(
      validateListingImage(bytes, {
        mimeType: "image/jpeg",
        sizeBytes: bytes.length,
        checksumSha256: createHash("sha256").update(bytes).digest("hex")
      })
    ).rejects.toMatchObject({ code: "IMAGE_DIMENSIONS_UNSAFE" });
  });
});
