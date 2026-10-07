import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { parseStrictDate } from "../src/http/strict-date";

describe("parseStrictDate", () => {
  it("accepts calendar dates and timestamps", () => {
    expect(parseStrictDate("2026-10-08", "moveInDate").toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(parseStrictDate("2026-10-08T17:30:00-07:00", "iso").toISOString()).toBe("2026-10-09T00:30:00.000Z");
  });

  it("rejects ISO forms that Date cannot parse and impossible days", () => {
    for (const value of ["2026-W40-1", "2026-280", "20261008", "2026-02-30", "2026-02-31T10:00:00Z", "2026-13-01"]) {
      expect(() => parseStrictDate(value, "iso")).toThrow(BadRequestException);
    }
  });
});
