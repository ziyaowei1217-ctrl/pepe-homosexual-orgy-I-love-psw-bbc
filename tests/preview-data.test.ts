import { describe, expect, it } from "vitest";

import { createPreviewListings, isPreviewDataEnabled } from "../lib/preview-data";

describe("preview listing data", () => {
  it("contains independently identifiable inventory for Los Angeles and Boston", () => {
    const listings = createPreviewListings();

    expect(listings.length).toBeGreaterThanOrEqual(132);
    expect(listings.some((listing) => listing.area.startsWith("Los Angeles ·"))).toBe(true);
    expect(listings.some((listing) => listing.area.startsWith("Boston ·"))).toBe(true);
    expect(new Set(listings.map((listing) => listing.id))).toHaveLength(listings.length);
    expect(new Set(listings.map((listing) => listing.title))).toHaveLength(listings.length);
    expect(new Set(listings.map((listing) => `${listing.latitude},${listing.longitude}`))).toHaveLength(listings.length);
    expect(new Set(listings.map((listing) => listing.price)).size).toBeGreaterThan(50);
  });

  it("covers major student and employer metros across every US region", () => {
    const listings = createPreviewListings();
    const metroCounts = listings.reduce<Record<string, number>>((counts, listing) => {
      const metro = listing.area.split("·")[0].trim();
      counts[metro] = (counts[metro] ?? 0) + 1;
      return counts;
    }, {});

    expect(Object.keys(metroCounts).length).toBeGreaterThanOrEqual(36);
    for (const metro of ["New York", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC", "Raleigh-Durham"]) {
      expect(metroCounts[metro]).toBeGreaterThanOrEqual(3);
    }
  });

  it("can only be enabled explicitly outside production", () => {
    expect(isPreviewDataEnabled("true", "development")).toBe(true);
    expect(isPreviewDataEnabled("false", "development")).toBe(false);
    expect(isPreviewDataEnabled(undefined, "development")).toBe(false);
    expect(isPreviewDataEnabled("true", "production")).toBe(false);
  });
});
