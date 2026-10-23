import { describe, expect, it } from "vitest";

import { lastSearchState, normalizeFeedSignals, recordListingView, recordSearch } from "../lib/feed-signals";
import { defaultSearch } from "../lib/search-state";

const empty = normalizeFeedSignals(null);

describe("feed signals", () => {
  it("drops anything malformed", () => {
    expect(empty).toEqual({ viewedIds: [], lastSearch: "" });
    expect(normalizeFeedSignals({ viewedIds: ["a", "a", " ", 3, "b"], lastSearch: "https://evil.example/search?q=x" }))
      .toEqual({ viewedIds: ["a", "b"], lastSearch: "" });
    expect(normalizeFeedSignals({ viewedIds: Array.from({ length: 40 }, (_, index) => `id-${index}`) }).viewedIds).toHaveLength(30);
  });

  it("puts the latest view first without duplicates and leaves an unchanged history alone", () => {
    const viewed = recordListingView(recordListingView(recordListingView(empty, "a"), "b"), "a");
    expect(viewed.viewedIds).toEqual(["a", "b"]);
    expect(recordListingView(viewed, "a")).toBe(viewed);
    expect(recordListingView(viewed, " ")).toBe(viewed);
  });

  it("remembers what was searched for, not the page, view, sort or open pin, and forgets a cleared search", () => {
    const searched = recordSearch(empty, {
      ...defaultSearch, query: "Boston", moveIn: "2026-11-01", moveOut: "2027-01-15", priceMax: 2000, amenities: ["独卫"],
      page: 3, view: "map", sort: "price-low", selected: "listing-1"
    });
    expect(searched.lastSearch).toBe("/search?q=Boston&moveIn=2026-11-01&moveOut=2027-01-15&priceMax=2000&amenities=%E7%8B%AC%E5%8D%AB");
    expect(recordSearch(searched, { ...defaultSearch, query: "Boston", moveIn: "2026-11-01", moveOut: "2027-01-15", priceMax: 2000, amenities: ["独卫"], page: 2 })).toBe(searched);
    expect(recordSearch(searched, { ...defaultSearch, view: "list" }).lastSearch).toBe("");
  });

  it("reads the last search back and drops dates that have already started", () => {
    const lastSearch = "/search?q=Boston&moveIn=2026-11-01&moveOut=2027-01-15&priceMax=2000";
    expect(lastSearchState(lastSearch, "2026-10-22")).toMatchObject({ query: "Boston", moveIn: "2026-11-01", moveOut: "2027-01-15", priceMax: 2000 });
    expect(lastSearchState(lastSearch, "2026-11-02")).toMatchObject({ query: "Boston", moveIn: "", moveOut: "", priceMax: 2000 });
    expect(lastSearchState("/search?moveIn=2026-11-01&moveOut=2027-01-15", "2026-12-01")).toBeNull();
    expect(lastSearchState("", "2026-10-22")).toBeNull();
  });
});
