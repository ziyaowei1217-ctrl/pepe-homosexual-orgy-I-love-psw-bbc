import { describe, expect, it } from "vitest";

import { getListingStatusMeta, sortOwnerListings } from "../lib/landlord-listings";

describe("landlord listings", () => {
  it("sorts owner listings by most recently updated first", () => {
    const older = ownerListing("older", "DRAFT", "2026-06-30T10:00:00.000Z");
    const newer = ownerListing("newer", "SUBMITTED", "2026-07-01T10:00:00.000Z");

    expect(sortOwnerListings([older, newer]).map((listing) => listing.id)).toEqual(["newer", "older"]);
  });

  it("maps listing review statuses to landlord-facing labels", () => {
    expect(getListingStatusMeta("DRAFT")).toMatchObject({
      label: "草稿",
      variant: "secondary"
    });
    expect(getListingStatusMeta("SUBMITTED")).toMatchObject({
      label: "审核中",
      variant: "warning"
    });
    expect(getListingStatusMeta("APPROVED")).toMatchObject({
      label: "已上线",
      variant: "success"
    });
    expect(getListingStatusMeta("REJECTED")).toMatchObject({
      label: "需修改",
      variant: "danger"
    });
  });
});

function ownerListing(id: string, status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED", updatedAt: string) {
  return {
    id,
    status,
    updatedAt,
    title: id,
    area: "Los Angeles · Westwood",
    price: 1580
  };
}
