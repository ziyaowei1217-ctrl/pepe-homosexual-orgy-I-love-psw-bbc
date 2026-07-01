import { describe, expect, it } from "vitest";

import { getVisibleSelectedListing } from "../lib/listing-selection";

describe("listing selection", () => {
  it("keeps the current listing when it is still visible", () => {
    const current = listing("westwood");
    const visibleListings = [listing("koreatown"), current];

    expect(getVisibleSelectedListing(current, visibleListings)).toBe(current);
  });

  it("falls back to the first visible listing when filters hide the current one", () => {
    const current = listing("westwood");
    const firstVisible = listing("usc");

    expect(getVisibleSelectedListing(current, [firstVisible, listing("glendale")])).toBe(firstVisible);
  });
});

function listing(id: string) {
  return { id, title: id };
}
