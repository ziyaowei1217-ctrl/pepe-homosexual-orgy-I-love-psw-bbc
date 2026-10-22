import { describe, expect, it } from "vitest";

import { buildHomeFeeds, interestListings, similarListings } from "../lib/listing-feeds";
import type { ListingMatch } from "../lib/listing-match";
import { createPreviewListings, type PreviewListing } from "../lib/preview-data";
import { defaultSearch } from "../lib/search-state";

const now = Date.parse("2026-10-22T19:00:00Z");
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();
const base = createPreviewListings()[0];

function home(id: string, area: string, overrides: Partial<PreviewListing> = {}): PreviewListing {
  return { ...base, id, title: id, area, price: 1800, beds: 1, tags: ["Wi-Fi"], availableFrom: "2026-10-01", availableTo: "2027-03-31", ...overrides };
}

function feeds(listings: PreviewListing[], options: Partial<Parameters<typeof buildHomeFeeds>[1]> = {}) {
  const savedIds = options.savedIds ?? [];
  const viewedIds = options.viewedIds ?? [];
  return buildHomeFeeds(listings, {
    matches: new Map(),
    interest: interestListings(listings, savedIds, viewedIds),
    savedIds,
    viewedIds,
    search: null,
    now,
    ...options
  });
}

const ids = (items: Array<{ listing: PreviewListing }>) => items.map((item) => item.listing.id);
const match = (score: number): ListingMatch => ({ score, reasons: [], gaps: [] });

describe("home feeds", () => {
  it("starts as 精选房源: bookable listings, newest first", () => {
    const result = feeds([
      home("old", "Boston · Fenway", { listedAt: daysAgo(40) }),
      home("ended", "Seattle · Bellevue", { availableTo: "2026-10-20", listedAt: daysAgo(1) }),
      home("new", "Austin · West Campus", { listedAt: daysAgo(1) })
    ]);
    expect(result.personalized).toBe(false);
    expect(ids(result.forYou)).toEqual(["new", "old"]);
    expect(result.recent).toEqual([]);
  });

  it("does not fill the row with one neighborhood when another is close in relevance", () => {
    const result = feeds([
      home("fenway-1", "Boston · Fenway", { listedAt: daysAgo(0) }),
      home("fenway-2", "Boston · Fenway", { listedAt: daysAgo(0) }),
      home("allston", "Boston · Allston", { listedAt: daysAgo(2), price: 2600, beds: 2, tags: ["独卫"] })
    ]);
    expect(ids(result.forYou)).toEqual(["fenway-1", "allston", "fenway-2"]);
  });

  it("ranks by match score when the renter has preferences", () => {
    const listings = [home("a", "Boston · Fenway"), home("b", "Boston · Allston"), home("c", "Austin · West Campus")];
    const result = feeds(listings, { matches: new Map([["a", match(40)], ["b", match(90)], ["c", match(70)]]) });
    expect(result.personalized).toBe(true);
    expect(ids(result.forYou)[0]).toBe("b");
    expect(result.forYou[0].match?.score).toBe(90);
  });

  it("follows saved and viewed homes without preferences, and does not recommend them again", () => {
    const listings = [
      home("saved", "Boston · Fenway"),
      home("viewed", "Boston · Fenway"),
      home("boston", "Boston · Fenway"),
      home("austin", "Austin · West Campus", { listedAt: daysAgo(0) })
    ];
    const result = feeds(listings, { savedIds: ["saved"], viewedIds: ["viewed"] });
    expect(result.personalized).toBe(true);
    expect(ids(result.forYou)).toEqual(["boston", "austin"]);
    expect(ids(result.recent)).toEqual(["viewed"]);
  });

  it("keeps 为你推荐 to the place last searched, and falls back to everything when nothing is there", () => {
    const listings = [
      home("boston", "Boston · Fenway"),
      home("austin", "Austin · West Campus", { listedAt: daysAgo(0) }),
      home("seattle", "Seattle · Bellevue", { listedAt: daysAgo(0) })
    ];
    expect(ids(feeds(listings, { search: { ...defaultSearch, query: "Boston", priceMax: 2400 } }).forYou)).toEqual(["boston"]);
    expect(ids(feeds(listings, { search: { ...defaultSearch, query: "Denver" } }).forYou)).toHaveLength(3);
  });

  it("shows up to four viewed homes, newest first, skipping ones no longer listed", () => {
    const listings = ["a", "b", "c", "d", "e"].map((id) => home(id, "Boston · Fenway"));
    expect(ids(feeds(listings, { viewedIds: ["e", "gone", "c", "a", "b", "d"] }).recent)).toEqual(["e", "c", "a", "b"]);
  });

  it("lists homes that went live in the last two weeks and fit the last search, without repeating 为你推荐", () => {
    const fresh = Array.from({ length: 12 }, (_, index) => home(`boston-${index}`, "Boston · Fenway", { listedAt: daysAgo(index) }));
    const others = Array.from({ length: 12 }, (_, index) => home(`austin-${index}`, "Austin · West Campus", { listedAt: daysAgo(index) }));
    const result = feeds([...others, ...fresh], { search: { ...defaultSearch, query: "Boston" } });
    const shown = new Set(ids(result.forYou));
    expect(result.fresh.length).toBeGreaterThan(0);
    expect(result.fresh.length).toBeLessThanOrEqual(4);
    for (const { listing } of result.fresh) {
      expect(listing.area.startsWith("Boston")).toBe(true);
      expect(shown.has(listing.id)).toBe(false);
      expect(now - Date.parse(listing.listedAt!)).toBeLessThanOrEqual(14 * 86_400_000);
    }
    const ages = result.fresh.map(({ listing }) => now - Date.parse(listing.listedAt!));
    expect(ages).toEqual([...ages].sort((left, right) => left - right));
  });
});

describe("similar listings", () => {
  it("keeps to the same city, drops the open and unbookable listings, and puts the closest first", () => {
    const target = home("target", "Boston · Fenway");
    const result = similarListings(target, [
      target,
      home("far-rent", "Boston · Allston", { price: 3200, beds: 3, tags: ["门卫"] }),
      home("twin", "Boston · Fenway"),
      home("ended", "Boston · Fenway", { availableTo: "2026-10-01" }),
      home("other-city", "Austin · West Campus"),
      home("near", "Boston · Allston")
    ], { today: "2026-10-22" });
    expect(result.map((listing) => listing.id)).toEqual(["twin", "near"]);
  });
});
