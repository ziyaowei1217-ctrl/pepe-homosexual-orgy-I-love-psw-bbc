import { describe, expect, it, vi } from "vitest";

import {
  executePublishSave,
  getPublishStepErrors,
  mapApiListingToPublishDraft,
  mapPublishDraftToListingDto,
  type PublishDraft
} from "../lib/publish-listing";
import { buildPublicListingsPath } from "../lib/api";
import type { ListingMediaSummary } from "../lib/listing-media";

const draft: PublishDraft = {
  title: "Westwood 主卧短租",
  area: "Los Angeles · Westwood",
  availableFrom: "2026-08-20",
  availableTo: "2026-12-31",
  beds: 1,
  baths: 1,
  commute: "步行 12 分钟到 UCLA",
  transit: "公交 5 分钟",
  price: 1680,
  originalPrice: 1900,
  tags: ["带家具", "Wi-Fi"],
  landlordAware: true,
  remoteListingId: null
};

const readyMedia: ListingMediaSummary = {
  totalCount: 2,
  readyCount: 2,
  pendingCount: 0,
  failedCount: 0,
  mutationPending: false
};

describe("publish listing", () => {
  it("validates the four real steps and maps exactly to the existing listing DTO", () => {
    expect(getPublishStepErrors(draft, "basic")).toEqual([]);
    expect(getPublishStepErrors(draft, "media", readyMedia)).toEqual([]);
    expect(getPublishStepErrors(draft, "pricing")).toEqual([]);
    expect(getPublishStepErrors(draft, "review", readyMedia)).toEqual([]);
    expect(mapPublishDraftToListingDto(draft)).toEqual({
      title: draft.title,
      area: draft.area,
      availableFrom: "2026-08-20",
      availableTo: "2026-12-31",
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

  it("blocks submission until every retained image is ready", () => {
    expect(getPublishStepErrors(draft, "media", { ...readyMedia, totalCount: 0, readyCount: 0 }))
      .toContain("请至少上传一张图片。");
    expect(getPublishStepErrors(draft, "media", { ...readyMedia, readyCount: 1, pendingCount: 1 }))
      .toContain("请等待所有图片完成上传和校验。");
    expect(getPublishStepErrors(draft, "review", { ...readyMedia, readyCount: 1, failedCount: 1 }))
      .toContain("请删除失败图片或重试上传。");
  });

  it("rejects missing or non-increasing listing availability", () => {
    expect(
      getPublishStepErrors({ ...draft, availableFrom: "" }, "basic")
    ).toContain("请选择可入住日期。");
    expect(
      getPublishStepErrors(
        {
          ...draft,
          availableFrom: "2026-12-31",
          availableTo: "2026-08-20"
        },
        "basic"
      )
    ).toContain("最晚退租日期必须晚于可入住日期。");
  });

  it("builds public listing paths only for empty or complete date ranges", () => {
    expect(buildPublicListingsPath({ checkIn: "", checkOut: "" })).toBe(
      "/listings"
    );
    expect(
      buildPublicListingsPath({
        checkIn: "2026-08-20",
        checkOut: "2026-09-20"
      })
    ).toBe("/listings?moveIn=2026-08-20&moveOut=2026-09-20");
    expect(
      buildPublicListingsPath({ checkIn: "2026-08-20", checkOut: "" })
    ).toBeNull();
  });

  it("saves the listing independently from media and does not create again on retry", async () => {
    const create = vi.fn().mockResolvedValue({ id: "remote-1" });
    const update = vi.fn().mockResolvedValue({ id: "remote-1" });
    const submit = vi.fn();

    const first = await executePublishSave(draft, { create, update, submit }, false);
    expect(first).toMatchObject({
      status: "saved",
      remoteListingId: "remote-1"
    });

    const retry = await executePublishSave(
      {
        ...draft,
        remoteListingId: first.remoteListingId
      },
      { create, update, submit },
      true
    );

    expect(retry.status).toBe("submitted");
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith("remote-1");
  });

  it("returns the saved remote id when review submission fails", async () => {
    const result = await executePublishSave(
      draft,
      {
        create: vi.fn().mockResolvedValue({ id: "remote-2" }),
        update: vi.fn(),
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

  it("restores an editable remote draft while media recovers independently", () => {
    const restored = mapApiListingToPublishDraft({
      id: "remote-3",
      title: draft.title,
      area: draft.area,
      image: "",
      availableFrom: draft.availableFrom,
      availableTo: draft.availableTo,
      price: draft.price,
      originalPrice: draft.originalPrice,
      beds: draft.beds,
      baths: draft.baths,
      commute: draft.commute,
      transit: draft.transit,
      trust: "房东知情声明 · 待平台审核",
      tags: ["带家具", "Wi-Fi", "房东知情"],
      score: 4.8,
      status: "DRAFT"
    });

    expect(restored).toMatchObject({
      remoteListingId: "remote-3",
      availableFrom: draft.availableFrom,
      availableTo: draft.availableTo,
      landlordAware: true,
      tags: ["带家具", "Wi-Fi"]
    });
  });
});
