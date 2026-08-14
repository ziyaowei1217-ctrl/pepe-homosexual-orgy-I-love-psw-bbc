import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import {
  buildListingAvailabilityWhere,
  parseListingDate,
  validateListingAvailability
} from "../src/listings/listing-availability";

describe("listing availability", () => {
  it("parses an exact calendar date at UTC midnight", () => {
    expect(parseListingDate("2026-08-20", "availableFrom")).toEqual(
      new Date("2026-08-20T00:00:00.000Z")
    );
  });

  it.each(["2026-8-20", "2026/08/20", "2026-02-30", "not-a-date"])(
    "rejects malformed or impossible calendar date %s",
    (value) => {
      expect(() => parseListingDate(value, "availableFrom")).toThrow(
        BadRequestException
      );
    }
  );

  it("accepts a strictly increasing listing availability range", () => {
    expect(
      validateListingAvailability("2026-08-20", "2026-12-31")
    ).toEqual({
      availableFrom: new Date("2026-08-20T00:00:00.000Z"),
      availableTo: new Date("2026-12-31T00:00:00.000Z")
    });
  });

  it.each([
    ["2026-09-01", "2026-08-31"],
    ["2026-09-01", "2026-09-01"]
  ])("rejects a non-increasing range from %s to %s", (from, to) => {
    expect(() => validateListingAvailability(from, to)).toThrow(
      BadRequestException
    );
  });

  it("returns no coverage predicate when both public dates are absent", () => {
    expect(buildListingAvailabilityWhere({})).toEqual({});
  });

  it.each([
    [{ moveIn: "2026-08-20" }],
    [{ moveOut: "2026-09-20" }]
  ])("rejects a one-sided public date query", (query) => {
    expect(() => buildListingAvailabilityWhere(query)).toThrow(
      BadRequestException
    );
  });

  it("builds an inclusive full-coverage predicate", () => {
    expect(
      buildListingAvailabilityWhere({
        moveIn: "2026-08-20",
        moveOut: "2026-09-20"
      })
    ).toEqual({
      availableFrom: {
        lte: new Date("2026-08-20T00:00:00.000Z")
      },
      availableTo: {
        gte: new Date("2026-09-20T00:00:00.000Z")
      }
    });
  });

  it("rejects a reversed public date query", () => {
    expect(() =>
      buildListingAvailabilityWhere({
        moveIn: "2026-09-20",
        moveOut: "2026-08-20"
      })
    ).toThrow(BadRequestException);
  });
});
