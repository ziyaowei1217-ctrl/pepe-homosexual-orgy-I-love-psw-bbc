import { describe, expect, it } from "vitest";

import { getListingCardDomId, getVisibleSelectedListing, isSelectedListing } from "../lib/listing-selection";

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

  it("uses the same selected listing id for list cards and map markers", () => {
    expect(isSelectedListing("westwood", listing("westwood"))).toBe(true);
    expect(isSelectedListing("westwood", listing("koreatown"))).toBe(false);
  });

  it("builds a stable card target for map marker navigation", () => {
    expect(getListingCardDomId("westwood")).toBe("listing-card-westwood");
  });
});

function listing(id: string) {
  return { id, title: id };
}
