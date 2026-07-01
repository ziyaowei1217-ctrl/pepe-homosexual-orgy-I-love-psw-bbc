export type ListingStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";

export type OwnerListingSummary = {
  id: string;
  title: string;
  area: string;
  price: number;
  status: ListingStatus;
  updatedAt?: string | Date;
};

export type ListingStatusMeta = {
  label: string;
  description: string;
  variant: "secondary" | "warning" | "success" | "danger";
};

const listingStatusMeta: Record<ListingStatus, ListingStatusMeta> = {
  DRAFT: {
    label: "草稿",
    description: "还未提交审核，租客暂时看不到。",
    variant: "secondary"
  },
  SUBMITTED: {
    label: "审核中",
    description: "已进入审核队列，通过后会出现在公开找房页。",
    variant: "warning"
  },
  APPROVED: {
    label: "已上线",
    description: "租客可以在 Discover 中看到这套房源。",
    variant: "success"
  },
  REJECTED: {
    label: "需修改",
    description: "请根据审核意见修改后重新提交。",
    variant: "danger"
  }
};

export function getListingStatusMeta(status: ListingStatus): ListingStatusMeta {
  return listingStatusMeta[status];
}

export function sortOwnerListings<T extends OwnerListingSummary>(listings: T[]): T[] {
  return [...listings].sort((left, right) => getUpdatedTime(right) - getUpdatedTime(left));
}

function getUpdatedTime(listing: OwnerListingSummary) {
  if (!listing.updatedAt) return 0;

  const time = listing.updatedAt instanceof Date ? listing.updatedAt.getTime() : new Date(listing.updatedAt).getTime();
  return Number.isFinite(time) ? time : 0;
}
