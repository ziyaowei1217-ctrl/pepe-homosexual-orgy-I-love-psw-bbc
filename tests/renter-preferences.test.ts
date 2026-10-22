// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import {
  describeRenterPreferences,
  emptyRenterPreferences,
  hasRenterPreferences,
  normalizeRenterPreferences,
  withSearchState,
  writeRenterPreferences
} from "../lib/renter-preferences";
import { defaultSearch } from "../lib/search-state";

afterEach(() => localStorage.clear());

describe("renter preferences", () => {
  it("keeps only valid values", () => {
    expect(normalizeRenterPreferences({
      destination: "  UCLA ", budgetMax: 1799.6, moveIn: "2026-09-01", moveOut: "2026-08-01", beds: 9, mustHave: ["洗烘", "泳池", "独卫", "洗烘"]
    }, "2026-07-01")).toEqual({ destination: "UCLA", budgetMax: 1800, moveIn: "2026-09-01", moveOut: "", beds: 4, mustHave: ["独卫", "洗烘"] });
    expect(normalizeRenterPreferences({ moveOut: "2026-12-01", budgetMax: -5, beds: "2" })).toEqual(emptyRenterPreferences);
    expect(normalizeRenterPreferences("broken")).toEqual(emptyRenterPreferences);
    expect(hasRenterPreferences(emptyRenterPreferences)).toBe(false);
  });

  it("moves a move-in that has passed to today", () => {
    expect(normalizeRenterPreferences({ moveIn: "2026-08-01", moveOut: "2026-12-20" }, "2026-10-22"))
      .toEqual({ ...emptyRenterPreferences, moveIn: "2026-10-22", moveOut: "2026-12-20" });
    expect(normalizeRenterPreferences({ moveIn: "2026-08-01", moveOut: "2026-09-30" }, "2026-10-22"))
      .toEqual({ ...emptyRenterPreferences, moveIn: "2026-10-22" });
  });

  it("ranks a search only by what its filters do not already guarantee", () => {
    const saved = { destination: "USC", budgetMax: 2000, moveIn: "2026-11-01", moveOut: "2026-12-20", beds: 1, mustHave: ["独卫", "洗烘"] };
    expect(withSearchState(saved, defaultSearch)).toEqual(saved);
    // Every result already fits the search's budget, bedrooms, amenities and dates; stricter saved values stay.
    expect(withSearchState(saved, { ...defaultSearch, priceMax: 1600, moveIn: "2026-12-01", moveOut: "2027-01-01", beds: 2, amenities: ["洗烘"] }))
      .toEqual({ ...emptyRenterPreferences, destination: "USC", mustHave: ["独卫"] });
    expect(withSearchState(saved, { ...defaultSearch, priceMax: 2500 }).budgetMax).toBe(2000);
    expect(withSearchState({ ...saved, beds: 2 }, { ...defaultSearch, beds: 1 }).beds).toBe(2);
    // Filters alone are not preferences.
    expect(hasRenterPreferences(withSearchState(emptyRenterPreferences, { ...defaultSearch, priceMax: 2000, beds: 2, amenities: ["独卫"] }))).toBe(false);
    // A move-in without a move-out does not filter, so the saved dates stay.
    expect(withSearchState(saved, { ...defaultSearch, moveIn: "2026-12-01", moveOut: "" }).moveIn).toBe("2026-11-01");
  });

  it("uses the searched place when it is in another city than the saved destination, and never a plain keyword", () => {
    const saved = { ...emptyRenterPreferences, destination: "USC" };
    expect(withSearchState(saved, { ...defaultSearch, query: "Los Angeles" }).destination).toBe("USC");
    expect(withSearchState(saved, { ...defaultSearch, query: "Boston" }).destination).toBe("Boston");
    expect(withSearchState(saved, { ...defaultSearch, query: "MIT" }).destination).toBe("MIT");
    expect(withSearchState(emptyRenterPreferences, { ...defaultSearch, query: " Boston " }).destination).toBe("Boston");
    expect(withSearchState(emptyRenterPreferences, { ...defaultSearch, query: "独卫" }).destination).toBe("");
    expect(withSearchState(saved, { ...defaultSearch, query: "独卫" }).destination).toBe("USC");
  });

  it("describes what is set in short labels", () => {
    expect(describeRenterPreferences({ destination: "UCLA", budgetMax: 1800, moveIn: "2026-12-01", moveOut: "", beds: 2, mustHave: ["独卫"] }))
      .toEqual(["UCLA", "≤ $1,800/月", "12月1日入住", "2+ 卧", "独卫"]);
  });

  it("saves normalized preferences on this device", () => {
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "MIT", mustHave: ["泳池"] });
    expect(JSON.parse(localStorage.getItem("sublet_renter_preferences_v1") ?? "null")).toEqual({ ...emptyRenterPreferences, destination: "MIT" });
  });
});
