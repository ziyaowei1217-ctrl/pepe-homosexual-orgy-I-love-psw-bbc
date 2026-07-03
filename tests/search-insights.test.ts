import { describe, expect, it } from "vitest";

import { buildSearchInsight } from "../lib/search-insights";

describe("search insights", () => {
  it("summarizes active search constraints for the discover surface", () => {
    const insight = buildSearchInsight(
      {
        query: "Los Angeles",
        checkIn: "2026-08-20",
        checkOut: "2026-11-30",
        budget: 4200,
        amenity: "Wi-Fi"
      },
      20
    );

    expect(insight.status).toBe("healthy");
    expect(insight.chips).toEqual([
      "Los Angeles",
      "8月20日 - 11月30日 · 102 晚",
      "$4,200 以内",
      "Wi-Fi"
    ]);
    expect(insight.suggestion).toContain("地图");
  });

  it("nudges users toward flexible alternatives when exact matches are scarce", () => {
    const insight = buildSearchInsight(
      {
        query: "UCLA",
        checkIn: "2026-09-10",
        checkOut: "2026-09-19",
        budget: 1200,
        amenity: "独卫"
      },
      2
    );

    expect(insight.status).toBe("tight");
    expect(insight.headline).toBe("命中偏少");
    expect(insight.suggestion).toContain("相近日期");
  });

  it("gives a concrete recovery suggestion for zero results", () => {
    const insight = buildSearchInsight(
      {
        query: "Impossible block",
        checkIn: "",
        checkOut: "",
        budget: 900,
        amenity: "宠物"
      },
      0
    );

    expect(insight.status).toBe("empty");
    expect(insight.headline).toBe("没有精确命中");
    expect(insight.suggestion).toContain("预算");
  });
});
