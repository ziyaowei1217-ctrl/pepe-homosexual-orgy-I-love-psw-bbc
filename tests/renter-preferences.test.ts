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
    })).toEqual({ destination: "UCLA", budgetMax: 1800, moveIn: "2026-09-01", moveOut: "", beds: 4, mustHave: ["独卫", "洗烘"] });
    expect(normalizeRenterPreferences({ moveOut: "2026-12-01", budgetMax: -5, beds: "2" })).toEqual(emptyRenterPreferences);
    expect(normalizeRenterPreferences("broken")).toEqual(emptyRenterPreferences);
    expect(hasRenterPreferences(emptyRenterPreferences)).toBe(false);
  });

  it("lets the open search's budget, dates and bedrooms win and adds its amenities", () => {
    const saved = { destination: "USC", budgetMax: 2000, moveIn: "2026-08-01", moveOut: "2026-12-20", beds: 1, mustHave: ["独卫"] };
    expect(withSearchState(saved, defaultSearch)).toEqual(saved);
    expect(withSearchState(saved, { ...defaultSearch, priceMax: 1600, moveIn: "2026-09-01", moveOut: "2027-01-01", beds: 2, amenities: ["洗烘"] }))
      .toEqual({ destination: "USC", budgetMax: 1600, moveIn: "2026-09-01", moveOut: "2027-01-01", beds: 2, mustHave: ["独卫", "洗烘"] });
    expect(withSearchState(saved, { ...defaultSearch, moveIn: "2026-09-01", moveOut: "" }).moveIn).toBe("2026-08-01");
  });

  it("describes what is set in short labels", () => {
    expect(describeRenterPreferences({ destination: "UCLA", budgetMax: 1800, moveIn: "2026-08-01", moveOut: "", beds: 2, mustHave: ["独卫"] }))
      .toEqual(["UCLA", "≤ $1,800/月", "8/1 入住", "2+ 卧", "独卫"]);
  });

  it("saves normalized preferences on this device", () => {
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "MIT", mustHave: ["泳池"] });
    expect(JSON.parse(localStorage.getItem("sublet_renter_preferences_v1") ?? "null")).toEqual({ ...emptyRenterPreferences, destination: "MIT" });
  });
});
