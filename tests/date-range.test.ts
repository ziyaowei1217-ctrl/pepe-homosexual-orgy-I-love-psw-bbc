import { describe, expect, it } from "vitest";

import { applyFlexibleStay, countNights, formatDateRangeLabel, selectDateRange } from "../lib/date-range";

describe("date range", () => {
  it("selects a check-in date and then a later checkout date", () => {
    const empty = { checkIn: "", checkOut: "" };
    const withCheckIn = selectDateRange(empty, "2026-08-20");
    const complete = selectDateRange(withCheckIn, "2026-08-27");

    expect(withCheckIn).toEqual({ checkIn: "2026-08-20", checkOut: "" });
    expect(complete).toEqual({ checkIn: "2026-08-20", checkOut: "2026-08-27" });
    expect(countNights(complete)).toBe(7);
  });

  it("resets the range when the next date is before check-in", () => {
    const range = { checkIn: "2026-08-20", checkOut: "2026-08-27" };

    expect(selectDateRange(range, "2026-08-10")).toEqual({
      checkIn: "2026-08-10",
      checkOut: ""
    });
  });

  it("applies flexible stay shortcuts from the selected check-in date", () => {
    const range = { checkIn: "2026-08-20", checkOut: "" };

    expect(applyFlexibleStay(range, 30)).toEqual({
      checkIn: "2026-08-20",
      checkOut: "2026-09-19"
    });
    expect(formatDateRangeLabel({ checkIn: "2026-08-20", checkOut: "2026-09-19" })).toBe("8月20日 - 9月19日 · 30 天");
  });
});
