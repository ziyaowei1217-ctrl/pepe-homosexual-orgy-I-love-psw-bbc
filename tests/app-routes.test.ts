import { describe, expect, it } from "vitest";

import { dmRouteForTarget, routeForSection, sectionForPathname } from "../lib/app-routes";

describe("app route map", () => {
  it("keeps stay and listing detail inside the home experience", () => {
    expect(routeForSection("Discover")).toBe("/");
    expect(routeForSection("ListingDetail")).toBe("/");
    expect(sectionForPathname("/")).toBe("Discover");
  });

  it("routes major workspaces to standalone pages", () => {
    expect(routeForSection("Messages")).toBe("/messages");
    expect(routeForSection("Roommates")).toBe("/roommates");
    expect(routeForSection("Publish")).toBe("/host/listings");
    expect(routeForSection("Trips")).toBe("/trips");
    expect(routeForSection("Trust")).toBe("/admin/trust");
  });

  it("recognizes standalone workspace paths", () => {
    expect(sectionForPathname("/messages")).toBe("Messages");
    expect(sectionForPathname("/roommates")).toBe("Roommates");
    expect(sectionForPathname("/host/listings/new")).toBe("Publish");
    expect(sectionForPathname("/trips")).toBe("Trips");
    expect(sectionForPathname("/account")).toBe("Discover");
    expect(sectionForPathname("/admin/trust")).toBe("Trust");
  });

  it("keeps landlord and roommate DM targets in separate workspaces", () => {
    expect(dmRouteForTarget({ kind: "listing", id: "westwood" })).toBe("/messages?listingId=westwood");
    expect(dmRouteForTarget({ kind: "roommate", id: "Mia Chen" })).toBe("/roommates?roommateId=Mia%20Chen");
  });
});
