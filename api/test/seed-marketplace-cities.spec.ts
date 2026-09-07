import { describe, expect, it } from "vitest";

import { seedListings } from "../src/seed-data";

describe("marketplace seed cities", () => {
  it("provides distinct approved-demo inventory for Boston as well as Los Angeles", () => {
    const bostonListings = seedListings.filter((listing) => listing.area.startsWith("Boston ·"));

    expect(bostonListings).toHaveLength(6);
    expect(new Set(bostonListings.map((listing) => listing.id))).toHaveLength(6);
    expect(new Set(bostonListings.map((listing) => listing.area)).size).toBeGreaterThan(3);
  });

  it("seeds nationwide inventory for major student and employer metros", () => {
    const metroCounts = seedListings.reduce<Record<string, number>>((counts, listing) => {
      const metro = listing.area.split("·")[0].trim();
      counts[metro] = (counts[metro] ?? 0) + 1;
      return counts;
    }, {});

    expect(Object.keys(metroCounts).length).toBeGreaterThanOrEqual(36);
    for (const metro of ["New York", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC", "Raleigh-Durham"]) {
      expect(metroCounts[metro]).toBeGreaterThanOrEqual(3);
    }
  });
});
