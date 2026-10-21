import { describe, expect, it } from "vitest";

import { currentYear, formatDateLong, formatDateShort, formatRangeLong, formatRangeShort } from "@/lib/date-format";

describe("psw date display", () => {
  it("writes dates in this year without the year", () => {
    expect(formatDateLong("2026-11-01", 2026)).toBe("11月1日");
    expect(formatDateShort("2026-11-01", 2026)).toBe("11/1");
  });

  it("adds the year only to dates outside this year", () => {
    expect(formatRangeLong("2026-11-01", "2027-01-15", 2026)).toBe("11月1日 – 2027年1月15日");
    expect(formatRangeShort("2026-10-13", "2027-08-21", 2026)).toBe("10/13 – 2027/8/21");
    expect(formatDateLong("2025-06-01", 2026)).toBe("2025年6月1日");
  });

  it("leaves values that are not ISO dates alone", () => {
    expect(formatDateLong("待确认", 2026)).toBe("待确认");
    expect(formatDateShort("", 2026)).toBe("");
  });

  it("reads the year in the marketplace's time zone", () => {
    // 2027-01-01 05:00 UTC is still New Year's Eve in Los Angeles.
    expect(currentYear(new Date("2027-01-01T05:00:00Z"))).toBe(2026);
  });
});
