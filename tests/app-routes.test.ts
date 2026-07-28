import { describe, expect, it } from "vitest";

import {
  discoverRouteForIntent,
  dmRouteForTarget,
  listingDetailRoute,
  routeForSection,
  sectionForRoute,
  sectionForPathname
} from "../lib/app-routes";

describe("app route map", () => {
  it("keeps stay and listing detail inside the home experience", () => {
    expect(routeForSection("Discover")).toBe("/");
    expect(routeForSection("ListingDetail")).toBe("/");
    expect(sectionForPathname("/")).toBe("Discover");
  });

  it("routes major workspaces to standalone pages", () => {
    expect(routeForSection("Messages")).toBe("/messages");
    expect(routeForSection("Roommates")).toBe("/roommates");
    expect(routeForSection("LikeQueue")).toBe("/roommates/likes");
    expect(routeForSection("Publish")).toBe("/host/listings");
    expect(routeForSection("Trips")).toBe("/trips");
    expect(routeForSection("Trust")).toBe("/admin/trust");
    expect(routeForSection("AdminRoommates")).toBe("/admin/roommates");
  });

  it("recognizes standalone workspace paths", () => {
    expect(sectionForPathname("/messages")).toBe("Messages");
    expect(sectionForPathname("/roommates/likes")).toBe("LikeQueue");
    expect(sectionForPathname("/roommates")).toBe("Roommates");
    expect(sectionForPathname("/host/listings/new")).toBe("Publish");
    expect(sectionForPathname("/trips")).toBe("Trips");
    expect(sectionForPathname("/account")).toBe("Discover");
    expect(sectionForPathname("/admin/trust")).toBe("Trust");
    expect(sectionForPathname("/admin/roommates")).toBe("AdminRoommates");
  });

  it("routes landlord and roommate DM targets into the unified messages workspace", () => {
    expect(dmRouteForTarget({ kind: "listing", id: "westwood" })).toBe("/messages?listingId=westwood");
    expect(dmRouteForTarget({ kind: "roommate", id: "Mia Chen" })).toBe("/messages?roommateId=Mia%20Chen");
    expect(dmRouteForTarget({ kind: "listing", id: "westwood" }, { tour: true })).toBe("/messages?listingId=westwood&tour=1");
    expect(
      dmRouteForTarget(
        { kind: "listing", id: "westwood" },
        { tour: true, dealRoomId: "room A/B" }
      )
    ).toBe("/messages?listingId=westwood&tour=1&dealRoomId=room%20A%2FB");
  });

  it("preserves explicit group-tour selection across route navigation", () => {
    expect(discoverRouteForIntent({ groupTour: true })).toBe("/?groupTour=1");
    expect(discoverRouteForIntent({ groupTour: true, dealRoomId: "room A/B" })).toBe(
      "/?groupTour=1&dealRoomId=room%20A%2FB"
    );
  });

  it("creates a durable route for a selected listing detail", () => {
    expect(listingDetailRoute("westwood")).toBe("/?listingId=westwood");
  });

  it("derives the visible workspace from the full route state", () => {
    expect(sectionForRoute("/", { listingId: "westwood" })).toBe("ListingDetail");
    expect(sectionForRoute("/messages", { listingId: "westwood" })).toBe("Messages");
    expect(sectionForRoute("/", {})).toBe("Discover");
  });
});
