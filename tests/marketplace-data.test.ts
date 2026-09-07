import { describe, expect, it } from "vitest";

import {
  loadMarketplaceListing,
  loadMarketplaceListings,
  normalizeMarketplaceListing
} from "../lib/marketplace-data";

const apiListing = {
  id: "listing-real-1",
  title: "Real listing",
  area: "Los Angeles · Westwood",
  image: "https://cdn.example.com/listing.jpg",
  price: 1800,
  originalPrice: 1950,
  beds: 2,
  baths: 1,
  commute: "12 分钟到 UCLA",
  transit: "近地铁",
  trust: "已审核",
  tags: ["Wi-Fi"],
  score: 4.8,
  availableFrom: "2026-09-01T00:00:00.000Z",
  availableTo: "2026-12-20T00:00:00.000Z"
};

describe("marketplace production data", () => {
  it("normalizes backend listings into the redesigned marketplace model", () => {
    expect(normalizeMarketplaceListing(apiListing)).toMatchObject({
      id: "listing-real-1",
      image: "https://cdn.example.com/listing.jpg",
      availableFrom: "2026-09-01",
      availableTo: "2026-12-20"
    });
  });

  it("uses the public listings API as the authoritative production source", async () => {
    const listings = await loadMarketplaceListings({
      fetchListings: async () => [apiListing],
      previewEnabled: false
    });

    expect(listings.map((listing) => listing.id)).toEqual(["listing-real-1"]);
  });

  it("keeps every ordered public photo for the detail gallery without adding stock photos", () => {
    const listing = normalizeMarketplaceListing({ ...apiListing, media: [
      { id: "2", kind: "kitchen", sortOrder: 2, contentUrl: "https://cdn.example.com/kitchen.jpg" },
      { id: "1", kind: "cover", sortOrder: 1, contentUrl: "https://cdn.example.com/cover.jpg" }
    ] });
    expect(listing.images).toEqual(["https://cdn.example.com/cover.jpg", "https://cdn.example.com/kitchen.jpg"]);
    expect(listing.image).toBe(listing.images?.[0]);
  });

  it("never replaces a production API failure with convincing fake listings", async () => {
    await expect(loadMarketplaceListings({
      fetchListings: async () => { throw new Error("offline"); },
      previewEnabled: false
    })).rejects.toThrow("offline");
  });

  it("allows explicit preview data only in a non-production demo", async () => {
    const listings = await loadMarketplaceListings({
      fetchListings: async () => { throw new Error("offline"); },
      previewEnabled: true
    });

    expect(listings[0]?.id).toBe("preview-01");
  });

  it("loads an individual real listing without consulting preview data", async () => {
    const listing = await loadMarketplaceListing("listing-real-1", {
      fetchListing: async (id) => ({ ...apiListing, id }),
      previewEnabled: false
    });

    expect(listing.id).toBe("listing-real-1");
  });

  it("only resolves preview listing ids when preview mode is explicit", async () => {
    const listing = await loadMarketplaceListing("preview-01", {
      fetchListing: async () => { throw new Error("should not fetch"); },
      previewEnabled: true
    });

    expect(listing.id).toBe("preview-01");
  });
});
