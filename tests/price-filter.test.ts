import { describe, expect, it } from "vitest";

import {
  filterListingsByPrice,
  formatPriceRangeLabel,
  normalizePriceRange,
  type PriceRangeFilter
} from "../lib/price-filter";

const listings = [
  { id: "micro", price: 950 },
  { id: "studio", price: 1650 },
  { id: "two-bed", price: 2800 },
  { id: "luxury", price: 4300 }
];

describe("price filter", () => {
  it("filters listings inclusively by minimum and maximum price", () => {
    const filtered = filterListingsByPrice(listings, { priceMin: 1200, priceMax: 2800 });

    expect(filtered.map((listing) => listing.id)).toEqual(["studio", "two-bed"]);
  });

  it("normalizes inverted or out-of-bound ranges", () => {
    expect(normalizePriceRange({ priceMin: 3600, priceMax: 1400 })).toEqual({
      priceMin: 1400,
      priceMax: 3600
    });

    expect(normalizePriceRange({ priceMin: -200, priceMax: 99_000 })).toEqual({
      priceMin: 0,
      priceMax: 6000
    });
  });

  it("formats readable range labels for chips and controls", () => {
    const range: PriceRangeFilter = { priceMin: 1200, priceMax: 3500 };

    expect(formatPriceRangeLabel(range)).toBe("$1,200 - $3,500");
    expect(formatPriceRangeLabel({ priceMin: 0, priceMax: 6000 })).toBe("全部价格");
    expect(formatPriceRangeLabel({ priceMin: 0, priceMax: 2500 })).toBe("$2,500 以下");
  });
});
