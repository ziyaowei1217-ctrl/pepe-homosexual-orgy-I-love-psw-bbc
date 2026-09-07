import { describe, expect, it } from "vitest";
import { applicationHref, initialListingStay, listingHref, listingStayError } from "../lib/listing-stay";

const listing = { availableFrom: "2026-09-01", availableTo: "2027-06-01" };
const stay = { moveIn: "2026-10-01", moveOut: "2026-12-01" };

describe("listing stay continuity", () => {
  it("carries the stay in links that survive reload and opening a new tab", () => {
    expect(listingHref("home/one", stay)).toBe("/listing/home%2Fone?moveIn=2026-10-01&moveOut=2026-12-01");
    expect(applicationHref("home", stay)).toBe("/applications/new?listingId=home&moveIn=2026-10-01&moveOut=2026-12-01");
    expect(listingHref("home")).toBe("/listing/home");
  });

  it("uses requested dates, defaults to the current available range and preserves incomplete selections", () => {
    expect(initialListingStay(listing, stay, "2026-09-05")).toEqual(stay);
    expect(initialListingStay(listing, undefined, "2026-09-05")).toEqual({ moveIn: "2026-09-05", moveOut: "2027-06-01" });
    expect(initialListingStay(listing, { moveIn: "2026-10-01" }, "2026-09-05")).toEqual({ moveIn: "2026-10-01", moveOut: "" });
  });

  it("rejects invalid dates, reversed stays, past dates, unavailable bounds and expired listings", () => {
    expect(listingStayError(stay, listing, "2026-09-05")).toBeNull();
    for (const invalid of [
      { ...stay, moveIn: "2026-02-30" },
      { ...stay, moveOut: "2026-10-01" },
      { ...stay, moveIn: "2026-09-02" },
      { ...stay, moveOut: "2027-07-01" },
      { ...stay, moveOut: "" }
    ]) expect(listingStayError(invalid, listing, "2026-09-05")).toBeTruthy();
    expect(listingStayError(stay, { ...listing, availableTo: "2026-08-01" }, "2026-09-05")).toContain("暂无可申请租期");
    expect(listingStayError(stay, { availableFrom: "", availableTo: "" }, "2026-09-05")).toContain("确认可租日期");
  });
});
