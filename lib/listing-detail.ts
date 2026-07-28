import { formatDateRangeLabel, type DateRange } from "./date-range";

export type DetailListing = {
  id: string;
  title: string;
  area: string;
  image: string;
  price: number;
  originalPrice: number;
  beds: number;
  baths: number;
  commute: string;
  transit: string;
  trust: string;
  tags: string[];
  score: number;
};

export type ListingFlowInputs = {
  favoriteIds: Set<string>;
  contactedIds: Set<string>;
  tourRequestedIds: Set<string>;
};

const detailGalleryFallbacks = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=1200&q=80"
];

export function buildListingGallery(listing: Pick<DetailListing, "image">) {
  return Array.from(new Set([listing.image, ...detailGalleryFallbacks]));
}

export function getGalleryIndex(currentIndex: number, direction: -1 | 1, galleryLength: number) {
  if (galleryLength <= 0) return 0;

  return (currentIndex + direction + galleryLength) % galleryLength;
}

export function buildListingDetail(listing: DetailListing, dateRange: DateRange) {
  const monthlySavings = Math.max(0, listing.originalPrice - listing.price);

  return {
    gallery: buildListingGallery(listing),
    stayLabel: formatDateRangeLabel(dateRange),
    monthlySavings,
    neighborhood: listing.area.split("·").at(1)?.trim() ?? listing.area,
    sections: {
      highlights: [
        listing.commute,
        listing.transit,
        `${listing.beds} 间卧室 · ${listing.baths} 间卫浴`,
        monthlySavings > 0 ? `比原价低 $${monthlySavings.toLocaleString()}/月` : "价格已锁定"
      ],
      houseRules: [
        listing.trust,
        listing.trust.includes("平台已审核") ? "平台已审核房东授权" : "房东知情为用户声明，待平台审核",
        listing.tags.includes("宠物友好") ? "宠物可谈" : "入住前完成室友偏好确认",
        listing.tags.includes("无烟") ? "无烟房源" : "公共区保持安静整洁"
      ],
      moveIn: [
        dateRange.checkIn ? `${formatDateRangeLabel(dateRange)} 已用于核对可租范围` : "选择日期可核对房源可租范围",
        "联系房东并预约看房",
        "在线申请、支付与资金托管暂未开放"
      ]
    }
  };
}

export function getListingFlowStatus(listingId: string, flow: ListingFlowInputs) {
  return {
    isFavorite: flow.favoriteIds.has(listingId),
    isContacted: flow.contactedIds.has(listingId),
    isTourRequested: flow.tourRequestedIds.has(listingId)
  };
}
