import { describe, expect, it } from "vitest";

import {
  buildCatalogPage,
  canFilterCatalogByDate,
  type CatalogListing,
  type CatalogQuery
} from "../lib/listing-catalog";

const listings: CatalogListing[] = Array.from({ length: 15 }, (_, index) => ({
  id: String(index + 1),
  title: index === 0 ? "UCLA 阳光主卧" : `房源 ${index + 1}`,
  area: index < 8 ? "Los Angeles · Westwood" : "Los Angeles · Koreatown",
  price: 1000 + index * 100,
  score: 4 + index / 100,
  baths: index === 0 ? 2 : 1,
  transit: index % 2 === 0 ? "近地铁" : "公交",
  tags: index % 3 === 0 ? ["Wi-Fi", "独卫"] : ["带家具"],
  availableFrom: index < 10 ? "2026-08-01" : "2026-09-01",
  availableTo: "2026-12-31"
}));

const baseQuery: CatalogQuery = {
  query: "",
  priceMin: 0,
  priceMax: 5000,
  amenity: "全部",
  checkIn: "",
  checkOut: "",
  sort: "recommended",
  page: 1,
  pageSize: 12
};

describe("listing catalog", () => {
  it("uses real amenity tags and defaults to all amenities", () => {
    expect(buildCatalogPage(listings, baseQuery).total).toBe(15);
    expect(buildCatalogPage(listings, { ...baseQuery, amenity: "Wi-Fi" }).total).toBe(5);
    expect(buildCatalogPage(listings, { ...baseQuery, amenity: "独卫" }).items.map((item) => item.id)).toEqual([
      "13",
      "10",
      "7",
      "4",
      "1"
    ]);
  });

  it("filters keywords, price and supported date ranges together", () => {
    const page = buildCatalogPage(listings, {
      ...baseQuery,
      query: "Westwood",
      priceMax: 1600,
      checkIn: "2026-08-20",
      checkOut: "2026-11-30"
    });

    expect(page.total).toBe(7);
    expect(page.dateFilterAvailable).toBe(true);
  });

  it("sorts, paginates by 12 and gives the map the exact current page", () => {
    const page = buildCatalogPage(listings, {
      ...baseQuery,
      sort: "price-high",
      page: 2
    });

    expect(page.total).toBe(15);
    expect(page.pageCount).toBe(2);
    expect(page.items).toHaveLength(3);
    expect(page.items.map((item) => item.id)).toEqual(["3", "2", "1"]);
    expect(page.mapItems).toEqual(page.items);
  });

  it("only advertises date filtering when every listing has both availability fields", () => {
    expect(canFilterCatalogByDate(listings)).toBe(true);
    expect(canFilterCatalogByDate(listings.map((listing, index) => (index === 0 ? { ...listing, availableTo: undefined } : listing)))).toBe(false);
  });
});
