import { describe, expect, it } from "vitest";

import { createPreviewListings, isPreviewDataEnabled } from "../lib/preview-data";

describe("preview listing data", () => {
  it("contains 24 independently identifiable listings with availability", () => {
    const listings = createPreviewListings();

    expect(listings).toHaveLength(24);
    expect(new Set(listings.map((listing) => listing.id))).toHaveLength(24);
    expect(new Set(listings.map((listing) => listing.title))).toHaveLength(24);
    expect(new Set(listings.map((listing) => listing.price))).toHaveLength(24);
    expect(new Set(listings.map((listing) => `${listing.latitude},${listing.longitude}`))).toHaveLength(24);
    expect(new Set(listings.map((listing) => `${listing.availableFrom}/${listing.availableTo}`))).toHaveLength(24);
  });

  it("can only be enabled explicitly outside production", () => {
    expect(isPreviewDataEnabled("true", "development")).toBe(true);
    expect(isPreviewDataEnabled("false", "development")).toBe(false);
    expect(isPreviewDataEnabled(undefined, "development")).toBe(false);
    expect(isPreviewDataEnabled("true", "production")).toBe(false);
  });
});
