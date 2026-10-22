import { describe, expect, it } from "vitest";

import { buildCatalogPage, type CatalogListing } from "../lib/listing-catalog";
import { listingSimilarity, rankListingsByMatch, scoreListingMatch, type MatchableListing } from "../lib/listing-match";
import { emptyRenterPreferences, type RenterPreferences } from "../lib/renter-preferences";

function listing(id: string, patch: Partial<MatchableListing> = {}): MatchableListing {
  return {
    id,
    area: "Los Angeles · Koreatown",
    price: 1500,
    beds: 1,
    tags: ["Wi-Fi"],
    commute: "紫线 16 分钟到 DTLA",
    transit: "步行 5 分钟到 Wilshire/Normandie",
    availableFrom: "2026-08-01",
    availableTo: "2027-08-01",
    ...patch
  };
}

function prefs(patch: Partial<RenterPreferences>): RenterPreferences {
  return { ...emptyRenterPreferences, ...patch };
}

describe("scoreListingMatch", () => {
  it("has no score until the renter states a preference, even with saved homes", () => {
    expect(scoreListingMatch(listing("a"), emptyRenterPreferences)).toBeNull();
    expect(scoreListingMatch(listing("a"), emptyRenterPreferences, { interest: [listing("b")] })).toBeNull();
  });

  it("scores rent against the monthly budget", () => {
    expect(scoreListingMatch(listing("a", { price: 1500 }), prefs({ budgetMax: 1800 }))).toEqual({
      score: 100, reasons: ["比预算低 $300/月"], gaps: []
    });
    expect(scoreListingMatch(listing("a", { price: 1750 }), prefs({ budgetMax: 1800 }))?.reasons).toEqual(["在预算内"]);
    const over = scoreListingMatch(listing("a", { price: 1980 }), prefs({ budgetMax: 1800 }));
    expect(over).toEqual({ score: 60, reasons: [], gaps: ["超出预算 $180/月"] });
    expect(scoreListingMatch(listing("a", { price: 2300 }), prefs({ budgetMax: 1800 }))?.score).toBe(0);
  });

  it("uses the listing's own commute to the destination when it names it", () => {
    const walk = listing("walk", { area: "Los Angeles · Westwood", commute: "步行 12 分钟到 UCLA" });
    const bus = listing("bus", { area: "Los Angeles · Westwood", commute: "公交 45 分钟到 UCLA" });
    expect(scoreListingMatch(walk, prefs({ destination: "ucla" }))).toEqual({ score: 100, reasons: ["步行 12 分钟到 UCLA"], gaps: [] });
    expect(scoreListingMatch(bus, prefs({ destination: "UCLA" }))).toEqual({ score: 40, reasons: [], gaps: [] });
  });

  it("falls back to map distance in the same city, and says when a home is in another city", () => {
    const sawtelle = listing("near", { area: "Los Angeles · Sawtelle", commute: "", transit: "" });
    const pasadena = listing("far", { area: "Los Angeles · Pasadena", commute: "", transit: "" });
    const boston = listing("boston", { area: "Boston · Fenway", commute: "", transit: "" });
    expect(scoreListingMatch(sawtelle, prefs({ destination: "UCLA" }))).toEqual({ score: 94, reasons: ["距 UCLA 约 3 公里"], gaps: [] });
    expect(scoreListingMatch(pasadena, prefs({ destination: "UCLA" }))).toEqual({ score: 0, reasons: [], gaps: ["距 UCLA 约 29 公里"] });
    expect(scoreListingMatch(boston, prefs({ destination: "UCLA" }))).toEqual({ score: 0, reasons: [], gaps: ["不在 Los Angeles"] });
  });

  it("matches cities, neighborhoods and market schools by name, whole words only", () => {
    expect(scoreListingMatch(listing("a"), prefs({ destination: "洛杉矶" }))?.score).toBe(100);
    expect(scoreListingMatch(listing("a"), prefs({ destination: "Koreatown" }))?.reasons).toEqual(["位于 Koreatown"]);
    const paloAlto = listing("p", { area: "San Jose · Palo Alto", commute: "15 分钟到 Stanford", transit: "" });
    const sanJose = listing("s", { area: "San Jose · Santa Clara", commute: "11 分钟到 NVIDIA", transit: "" });
    expect(scoreListingMatch(paloAlto, prefs({ destination: "Stanford" }))?.reasons).toEqual(["15 分钟到 Stanford"]);
    expect(scoreListingMatch(sanJose, prefs({ destination: "Stanford" }))?.score).toBe(50);
    const smith = listing("m", { area: "Boston · Back Bay", commute: "10 分钟到 Smith Center", transit: "" });
    expect(scoreListingMatch(smith, prefs({ destination: "MIT" }))?.reasons).toEqual(["距 MIT 约 2 公里"]);
  });

  it("scores how much of the renter's stay the listing covers", () => {
    const stay = prefs({ moveIn: "2026-09-01", moveOut: "2026-12-01" });
    expect(scoreListingMatch(listing("a"), stay)).toEqual({ score: 100, reasons: ["可住满你的日期"], gaps: [] });
    const short = scoreListingMatch(listing("a", { availableTo: "2026-10-16" }), stay);
    expect(short?.gaps).toEqual(["只能住到 10/16"]);
    expect(short?.score).toBe(24);
    expect(scoreListingMatch(listing("a", { availableFrom: "2026-09-16" }), prefs({ moveIn: "2026-09-01" }))).toEqual({
      score: 50, reasons: [], gaps: ["9/16 才能入住"]
    });
    expect(scoreListingMatch(listing("a", { availableTo: "2026-08-20" }), stay)?.gaps).toEqual(["8/20 后不可租"]);
  });

  it("scores must-have amenities and bedrooms", () => {
    const home = listing("a", { beds: 2, tags: ["独卫", "Wi-Fi"], transit: "近地铁" });
    expect(scoreListingMatch(home, prefs({ mustHave: ["独卫", "洗烘"], beds: 3 }))).toEqual({
      score: 45, reasons: ["有 独卫"], gaps: ["没有 洗烘", "少 1 间卧室"]
    });
    expect(scoreListingMatch(home, prefs({ mustHave: ["近地铁"], beds: 2 }))?.reasons).toEqual(["有 近地铁", "2 间卧室"]);
  });

  it("lists reasons in a fixed order: location, budget, dates, must-haves, bedrooms, saved homes", () => {
    const saved = listing("saved", { price: 1450 });
    const match = scoreListingMatch(listing("a"), prefs({ destination: "Koreatown", budgetMax: 2000, moveIn: "2026-09-01", beds: 1, mustHave: ["Wi-Fi"] }), { interest: [saved] });
    expect(match?.reasons).toEqual(["位于 Koreatown", "比预算低 $500/月", "9/1 可入住", "有 Wi-Fi", "1 间卧室", "和你看过或收藏的房源相似"]);
  });

  it("does not count a listing as similar to itself", () => {
    const home = listing("a");
    expect(scoreListingMatch(home, prefs({ budgetMax: 2000 }), { interest: [home] })?.reasons).toEqual(["比预算低 $500/月"]);
  });
});

describe("rankListingsByMatch", () => {
  it("ranks by score, then lower rent, and keeps listings without a match in their order", () => {
    const ranked = rankListingsByMatch(
      [listing("over", { price: 2100 }), listing("cheap", { price: 1300 }), listing("fit", { price: 1700 })],
      prefs({ budgetMax: 1800 })
    );
    expect(ranked.map((entry) => [entry.listing.id, entry.match?.score])).toEqual([["cheap", 100], ["fit", 100], ["over", 33]]);
    expect(rankListingsByMatch([listing("b"), listing("a")], emptyRenterPreferences).map((entry) => entry.listing.id)).toEqual(["b", "a"]);
  });
});

describe("listingSimilarity", () => {
  it("is 1 for the same home, 0 across cities, and symmetric", () => {
    const home = listing("a");
    const neighbor = listing("b", { price: 1650, beds: 2, tags: ["Wi-Fi", "独卫"] });
    expect(listingSimilarity(home, { ...home, id: "copy" })).toBe(1);
    expect(listingSimilarity(home, listing("c", { area: "Boston · Fenway" }))).toBe(0);
    expect(listingSimilarity(home, neighbor)).toBe(listingSimilarity(neighbor, home));
    expect(listingSimilarity(home, neighbor)).toBe(0.74);
  });
});

describe("recommended catalog sort", () => {
  it("puts the renter's best matches first", () => {
    const catalog: CatalogListing[] = ["a", "b", "c"].map((id, index) => ({
      id, title: id, area: "Los Angeles · Koreatown", price: 1500, score: 4.9 - index / 10, baths: 1, transit: "", tags: []
    }));
    const query = { query: "", priceMin: 0, priceMax: 5000, amenity: "全部", checkIn: "", checkOut: "", sort: "recommended" as const, page: 1, pageSize: 10 };
    const scores: Record<string, number> = { a: 40, b: 90 };
    expect(buildCatalogPage(catalog, query).items.map((item) => item.id)).toEqual(["a", "b", "c"]);
    expect(buildCatalogPage(catalog, query, (item) => scores[item.id]).items.map((item) => item.id)).toEqual(["b", "a", "c"]);
  });
});
