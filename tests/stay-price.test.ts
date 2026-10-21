import { describe, expect, it } from "vitest";

import { addMonthsClamped, formatStayLength, formatUsd, stayDays, stayPrice } from "@/lib/stay-price";

describe("stay price (whole months at the monthly rent, extra days by the actual month length)", () => {
  it("counts the nights between move-in and move-out", () => {
    expect(stayDays("2026-06-01", "2026-08-15")).toBe(75);
    expect(stayDays("2026-06-01", "2026-08-31")).toBe(91);
  });

  it("returns no days for missing, invalid or reversed dates", () => {
    expect(stayDays("", "2026-08-15")).toBe(0);
    expect(stayDays("2026-06-01", "not-a-date")).toBe(0);
    expect(stayDays("2026-02-30", "2026-03-15")).toBe(0);
    expect(stayDays("2026-08-15", "2026-06-01")).toBe(0);
    expect(stayDays("2026-06-01", "2026-06-01")).toBe(0);
  });

  it("adds months on the same day, clamped to the end of short months", () => {
    expect(addMonthsClamped("2026-06-01", 2)).toBe("2026-08-01");
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2026-11-15", 3)).toBe("2027-02-15");
  });

  it("charges whole months at the monthly rent and prorates the rest by that month's days", () => {
    expect(stayPrice(1680, "2026-06-01", "2026-08-31")).toEqual({
      days: 91, wholeMonths: 2, extraDays: 30, extraPeriodDays: 31, extraAmount: 1626, total: 4986, monthly: 1680
    });
    expect(stayPrice(1800, "2026-06-15", "2026-07-15")?.total).toBe(1800);
    expect(stayPrice(1680, "2026-11-01", "2026-12-20")?.total).toBe(2710);
    expect(stayPrice(1500, "2026-01-31", "2026-03-15")).toMatchObject({ wholeMonths: 1, extraDays: 15, extraPeriodDays: 31, total: 2226 });
    expect(stayPrice(1500, "2026-06-01", "2026-06-11")).toMatchObject({ wholeMonths: 0, extraDays: 10, extraPeriodDays: 30, total: 500 });
  });

  it("has no stay price without valid dates or rent", () => {
    expect(stayPrice(1800, "", "")).toBeNull();
    expect(stayPrice(0, "2026-06-01", "2026-08-15")).toBeNull();
  });

  it("describes the stay as months and days", () => {
    expect(formatStayLength({ wholeMonths: 2, extraDays: 30 })).toBe("2 个月 30 天");
    expect(formatStayLength({ wholeMonths: 3, extraDays: 0 })).toBe("3 个月");
    expect(formatStayLength({ wholeMonths: 0, extraDays: 19 })).toBe("19 天");
  });

  it("formats whole US dollars", () => {
    expect(formatUsd(4986)).toBe("$4,986");
    expect(formatUsd(1680.4)).toBe("$1,680");
  });
});
