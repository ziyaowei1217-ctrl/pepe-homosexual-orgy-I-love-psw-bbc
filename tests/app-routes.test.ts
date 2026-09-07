import { describe, expect, it } from "vitest";

import {
  authRoute,
  discoverRouteForIntent,
  dmRouteForTarget,
  getAuthIntent,
  getSafeAuthReturnTo,
  listingDetailRoute,
  routeForSection,
  sectionForRoute,
  sectionForPathname
} from "../lib/app-routes";

describe("app route map", () => {
  it("builds a dedicated authentication route that preserves a local return path", () => {
    expect(
      authRoute({
        returnTo: "/?listingId=westwood",
        intent: "message-host"
      })
    ).toBe("/account?returnTo=%2F%3FlistingId%3Dwestwood&intent=message-host");
  });

  it("accepts only local non-account return paths", () => {
    expect(getSafeAuthReturnTo("/messages?listingId=westwood")).toBe(
      "/messages?listingId=westwood"
    );
    expect(getSafeAuthReturnTo("https://evil.example/steal")).toBe("/");
    expect(getSafeAuthReturnTo("//evil.example/steal")).toBe("/");
    expect(getSafeAuthReturnTo("/account?returnTo=/messages")).toBe("/");
    expect(getSafeAuthReturnTo("/account/retry?returnTo=/messages")).toBe("/");
    expect(getSafeAuthReturnTo(undefined)).toBe("/");
  });

  it("accepts known auth intents and defaults unknown values", () => {
    expect(getAuthIntent("messages")).toBe("messages");
    expect(getAuthIntent("message-host")).toBe("message-host");
    expect(getAuthIntent("unknown-action")).toBe("account");
    expect(getAuthIntent(undefined)).toBe("account");
  });

  it("keeps the public landing page separate from routed listing detail", () => {
    expect(routeForSection("Discover")).toBe("/");
    expect(routeForSection("ListingDetail")).toBe("/search");
    expect(sectionForPathname("/")).toBe("Discover");
  });

  it("routes major workspaces to standalone pages", () => {
    expect(routeForSection("Messages")).toBe("/inbox");
    expect(routeForSection("Roommates")).toBe("/roommates");
    expect(routeForSection("LikeQueue")).toBe("/roommates/likes");
    expect(routeForSection("Publish")).toBe("/host/listings");
    expect(routeForSection("Trips")).toBe("/trips");
    expect(routeForSection("Trust")).toBe("/admin/trust");
    expect(routeForSection("AdminRoommates")).toBe("/admin/roommates");
  });

  it("recognizes standalone workspace paths", () => {
    expect(sectionForPathname("/inbox")).toBe("Messages");
    expect(sectionForPathname("/messages")).toBe("Messages");
    expect(sectionForPathname("/listing/westwood")).toBe("ListingDetail");
    expect(sectionForPathname("/roommates/likes")).toBe("LikeQueue");
    expect(sectionForPathname("/roommates")).toBe("Roommates");
    expect(sectionForPathname("/host/listings/new")).toBe("Publish");
    expect(sectionForPathname("/trips")).toBe("Trips");
    expect(sectionForPathname("/account")).toBe("Discover");
    expect(sectionForPathname("/admin/trust")).toBe("Trust");
    expect(sectionForPathname("/admin/roommates")).toBe("AdminRoommates");
  });

  it("routes landlord and roommate DM targets into the unified messages workspace", () => {
    expect(dmRouteForTarget({ kind: "listing", id: "westwood" })).toBe("/inbox?listingId=westwood");
    expect(dmRouteForTarget({ kind: "roommate", id: "Mia Chen" })).toBe("/inbox?roommateId=Mia%20Chen");
    expect(
      dmRouteForTarget(
        { kind: "roommate", id: "profile-b" },
        { conversationId: "conversation-a-b" }
      )
    ).toBe("/inbox/conversation-a-b");
    expect(dmRouteForTarget({ kind: "listing", id: "westwood" }, { tour: true })).toBe("/inbox?listingId=westwood&tour=1");
    expect(
      dmRouteForTarget(
        { kind: "listing", id: "westwood" },
        { tour: true, dealRoomId: "room A/B" }
      )
    ).toBe("/inbox?listingId=westwood&tour=1&dealRoomId=room%20A%2FB");
  });

  it("preserves explicit group-tour selection across route navigation", () => {
    expect(discoverRouteForIntent({ groupTour: true })).toBe("/?groupTour=1");
    expect(discoverRouteForIntent({ groupTour: true, dealRoomId: "room A/B" })).toBe(
      "/?groupTour=1&dealRoomId=room%20A%2FB"
    );
  });

  it("creates a durable route for a selected listing detail", () => {
    expect(listingDetailRoute("westwood")).toBe("/listing/westwood");
  });

  it("derives the visible workspace from the full route state", () => {
    expect(sectionForRoute("/", { listingId: "westwood" })).toBe("ListingDetail");
    expect(sectionForRoute("/listing/westwood")).toBe("ListingDetail");
    expect(sectionForRoute("/inbox/conversation-a-b")).toBe("Messages");
    expect(sectionForRoute("/messages", { listingId: "westwood" })).toBe("Messages");
    expect(sectionForRoute("/", {})).toBe("Discover");
  });
});
