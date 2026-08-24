import { describe, expect, it } from "vitest";

import {
  MAX_LISTING_MEDIA_BYTES,
  buildListingMediaSummary,
  getListingCoverUrl,
  listingFileError,
  runMediaUploadQueue,
  sha256Hex
} from "../lib/listing-media";

describe("listing media browser workflow", () => {
  it("accepts JPEG, PNG, and WebP within 10 MB and rejects unsupported or oversized files", () => {
    expect(listingFileError({ type: "image/jpeg", size: 1 }, 0)).toBeNull();
    expect(listingFileError({ type: "image/png", size: MAX_LISTING_MEDIA_BYTES }, 11)).toBeNull();
    expect(listingFileError({ type: "image/gif", size: 1 }, 0)).toBe("仅支持 JPEG、PNG 或 WebP 图片。");
    expect(listingFileError({ type: "image/webp", size: MAX_LISTING_MEDIA_BYTES + 1 }, 0)).toBe("单张图片不能超过 10 MB。");
    expect(listingFileError({ type: "image/png", size: 1 }, 12)).toBe("每套房源最多上传 12 张图片。");
  });

  it("computes a lowercase SHA-256 checksum from the real bytes", async () => {
    await expect(sha256Hex(new Uint8Array([97, 98, 99]).buffer)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("derives submission counts from server states and pending browser mutations", () => {
    expect(buildListingMediaSummary([
      { storageStatus: "READY" },
      { storageStatus: "PENDING_UPLOAD" },
      { storageStatus: "FAILED" }
    ], true)).toEqual({
      totalCount: 3,
      readyCount: 1,
      pendingCount: 1,
      failedCount: 1,
      mutationPending: true
    });
  });

  it("uses the first published media URL as the public listing cover", () => {
    expect(getListingCoverUrl({
      image: null,
      media: [
        { id: "media-2", kind: "卧室", sortOrder: 2, contentUrl: "/api/v1/listing-media/media-2/content" },
        { id: "media-1", kind: "封面", sortOrder: 1, contentUrl: "/api/v1/listing-media/media-1/content" }
      ]
    }, "https://api.example.test/api/v1")).toBe(
      "https://api.example.test/api/v1/listing-media/media-1/content"
    );
  });

  it("never returns an empty or null public listing cover", () => {
    expect(getListingCoverUrl({ image: null, media: [] }, "https://api.example.test/api/v1"))
      .toMatch(/^https:\/\/images\.unsplash\.com\//);
  });

  it("runs at most three uploads concurrently and isolates failures", async () => {
    let active = 0;
    let maximum = 0;
    const results = await runMediaUploadQueue([1, 2, 3, 4, 5], async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      if (value === 2) throw new Error("upload failed");
      return value * 10;
    });

    expect(maximum).toBe(3);
    expect(results).toEqual([
      { status: "fulfilled", value: 10 },
      { status: "rejected", reason: expect.any(Error) },
      { status: "fulfilled", value: 30 },
      { status: "fulfilled", value: 40 },
      { status: "fulfilled", value: 50 }
    ]);
  });
});
