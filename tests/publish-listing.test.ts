import { describe, expect, it, vi } from "vitest";

import {
  executePublishSave,
  getPublishStepErrors,
  mapApiListingToPublishDraft,
  mapPublishDraftToListingDto,
  type PublishDraft
} from "../lib/publish-listing";

const draft: PublishDraft = {
  title: "Westwood 主卧短租",
  area: "Los Angeles · Westwood",
  beds: 1,
  baths: 1,
  commute: "步行 12 分钟到 UCLA",
  transit: "公交 5 分钟",
  media: [
    { url: "https://example.com/bedroom.jpg", kind: "卧室" },
    { url: "https://example.com/kitchen.jpg", kind: "厨房" }
  ],
  price: 1680,
  originalPrice: 1900,
  tags: ["带家具", "Wi-Fi"],
  landlordAware: true,
  remoteListingId: null,
  uploadedMediaUrls: []
};

describe("publish listing", () => {
  it("validates the four real steps and maps exactly to the existing listing DTO", () => {
    expect(getPublishStepErrors(draft, "basic")).toEqual([]);
    expect(getPublishStepErrors(draft, "media")).toEqual([]);
    expect(getPublishStepErrors(draft, "pricing")).toEqual([]);
    expect(getPublishStepErrors(draft, "review")).toEqual([]);
    expect(mapPublishDraftToListingDto(draft)).toEqual({
      title: draft.title,
      area: draft.area,
      image: draft.media[0].url,
      price: 1680,
      originalPrice: 1900,
      beds: 1,
      baths: 1,
      commute: draft.commute,
      transit: draft.transit,
      trust: "房东知情声明 · 待平台审核",
      tags: ["带家具", "Wi-Fi", "房东知情"],
      score: 4.8
    });
  });

  it("retains the remote draft id when media upload partially fails and does not create again on retry", async () => {
    const create = vi.fn().mockResolvedValue({ id: "remote-1" });
    const update = vi.fn().mockResolvedValue({ id: "remote-1" });
    const addMedia = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({});
    const submit = vi.fn();

    const first = await executePublishSave(draft, { create, update, addMedia, submit }, false);
    expect(first).toMatchObject({
      status: "partial",
      remoteListingId: "remote-1",
      uploadedMediaUrls: ["https://example.com/bedroom.jpg"]
    });

    const retry = await executePublishSave(
      {
        ...draft,
        remoteListingId: first.remoteListingId,
        uploadedMediaUrls: first.uploadedMediaUrls
      },
      { create, update, addMedia, submit },
      true
    );

    expect(retry.status).toBe("submitted");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(addMedia).toHaveBeenCalledTimes(3);
    expect(submit).toHaveBeenCalledWith("remote-1");
  });

  it("returns the saved remote id when review submission fails", async () => {
    const result = await executePublishSave(
      { ...draft, media: [draft.media[0]] },
      {
        create: vi.fn().mockResolvedValue({ id: "remote-2" }),
        update: vi.fn(),
        addMedia: vi.fn().mockResolvedValue({}),
        submit: vi.fn().mockRejectedValue(new Error("service unavailable"))
      },
      true
    );

    expect(result).toMatchObject({
      status: "partial",
      remoteListingId: "remote-2",
      message: "草稿已保存，提交审核失败。请重试。"
    });
  });

  it("restores an editable remote draft without re-uploading existing media", () => {
    const restored = mapApiListingToPublishDraft({
      id: "remote-3",
      title: draft.title,
      area: draft.area,
      image: draft.media[0].url,
      price: draft.price,
      originalPrice: draft.originalPrice,
      beds: draft.beds,
      baths: draft.baths,
      commute: draft.commute,
      transit: draft.transit,
      trust: "房东知情声明 · 待平台审核",
      tags: ["带家具", "Wi-Fi", "房东知情"],
      score: 4.8,
      status: "DRAFT",
      media: [
        { id: "media-2", url: draft.media[1].url, kind: "厨房", sortOrder: 2 },
        { id: "media-1", url: draft.media[0].url, kind: "卧室", sortOrder: 1 }
      ]
    });

    expect(restored).toMatchObject({
      remoteListingId: "remote-3",
      landlordAware: true,
      tags: ["带家具", "Wi-Fi"],
      media: draft.media,
      uploadedMediaUrls: draft.media.map((item) => item.url)
    });
  });
});
