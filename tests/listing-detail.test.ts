import { describe, expect, it } from "vitest";

import {
  buildListingDetail,
  buildListingGallery,
  getGalleryIndex,
  getListingFlowStatus
} from "../lib/listing-detail";

const listing = {
  id: "westwood",
  title: "Westwood UCLA 步行圈阳光主卧",
  area: "Los Angeles · Westwood",
  image: "https://images.example/primary.jpg",
  price: 1680,
  originalPrice: 1980,
  beds: 1,
  baths: 1,
  commute: "步行 8 分钟到 UCLA",
  transit: "公共交通 14 分钟 · Westwood",
  trust: ".edu 已认证 · 房东知情",
  tags: ["独卫", "电梯", "可 8/20 入住"],
  score: 4.82
};

describe("listing detail", () => {
  it("builds a renter-ready detail model from a listing and date range", () => {
    const detail = buildListingDetail(listing, {
      checkIn: "2026-08-20",
      checkOut: "2026-09-19"
    });

    expect(detail.stayLabel).toBe("8月20日 - 9月19日 · 30 天");
    expect(detail.gallery).toHaveLength(4);
    expect(detail.gallery[0]).toBe(listing.image);
    expect(detail.monthlySavings).toBe(300);
    expect(detail.sections.highlights).toContain("步行 8 分钟到 UCLA");
    expect(detail.sections.houseRules).toContain("房东知情为用户声明，待平台审核");
    expect(detail.sections.moveIn).toContain("在线申请后由房东处理，接受后进入演示支付与资金状态");
    expect(detail.sections.moveIn.join(" ")).not.toContain("暂未开放");
  });

  it("summarizes the current listing flow state", () => {
    expect(
      getListingFlowStatus("westwood", {
        favoriteIds: new Set(["westwood"]),
        contactedIds: new Set(["westwood"]),
        tourRequestedIds: new Set(["koreatown"])
      })
    ).toEqual({
      isFavorite: true,
      isContacted: true,
      isTourRequested: false
    });
  });

  it("builds a reusable listing gallery for search cards and detail pages", () => {
    const gallery = buildListingGallery(listing);

    expect(gallery).toHaveLength(4);
    expect(gallery[0]).toBe(listing.image);
    expect(new Set(gallery).size).toBe(gallery.length);
  });

  it("does not put an empty image URL into the detail gallery", () => {
    const gallery = buildListingGallery({ image: "" });

    expect(gallery).toHaveLength(3);
    expect(gallery).not.toContain("");
  });

  it("wraps listing gallery navigation in both directions", () => {
    expect(getGalleryIndex(0, -1, 4)).toBe(3);
    expect(getGalleryIndex(3, 1, 4)).toBe(0);
    expect(getGalleryIndex(1, 1, 4)).toBe(2);
  });
});
