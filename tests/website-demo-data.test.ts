import { describe, expect, it } from "vitest";

import type { ApiListing, ApiRoommate, ApiRoommateDeckResponse } from "../lib/api";
import { ProductApiError } from "../lib/product-errors";
import { getWebsiteDemoData } from "../lib/website-demo-data";

function expectStatus(path: string, status: number) {
  try {
    getWebsiteDemoData(path);
    expect.fail(`Expected demo request to fail: ${path}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ProductApiError);
    expect(error).toMatchObject({ status, retryable: false });
  }
}

describe("public website demonstration data", () => {
  it("only returns explicitly synthetic listings with no approval or owner claims", () => {
    const listings = getWebsiteDemoData("/listings") as ApiListing[];
    expect(listings.length).toBeGreaterThanOrEqual(132);
    expect(new Set(listings.map((listing) => listing.id)).size).toBe(listings.length);
    for (const listing of listings) {
      expect(listing.title).toContain("演示房源");
      expect(listing.trust).toContain("虚构");
      expect(listing.trust).toContain("未经平台审核");
      expect(listing.ownerId).toBeUndefined();
      expect(listing.status).toBeUndefined();
    }
    expect(getWebsiteDemoData(`/listings/${listings[0].id}`)).toEqual(listings[0]);
  });

  it("isolates nested mutations across reads and details", () => {
    const first = getWebsiteDemoData("/listings") as ApiListing[];
    const id = first[0].id;
    const originalTag = first[0].tags[0];
    first[0].tags[0] = "mutated";
    first[0].title = "mutated";
    const next = getWebsiteDemoData(`/listings/${id}`) as ApiListing;
    expect(next.tags[0]).toBe(originalTag);
    expect(next.title).not.toBe("mutated");
    const deck = getWebsiteDemoData("/roommates/deck") as ApiRoommateDeckResponse;
    deck.items[0].tags[0] = "mutated";
    deck.items[0].reasons!.push("mutated");
    deck.discovery.tips.push("mutated");
    const fresh = getWebsiteDemoData("/roommates/deck") as ApiRoommateDeckResponse;
    expect(JSON.stringify(fresh)).not.toContain("mutated");
    const profile = getWebsiteDemoData(`/roommates/deck/${fresh.items[0].id}`) as ApiRoommate;
    expect(profile.tags).toEqual(fresh.items[0].tags);
  });

  it("filters listings only when a complete real calendar date range is supplied", () => {
    const moveIn = "2026-10-01";
    const moveOut = "2026-11-01";
    const filtered = getWebsiteDemoData(`/listings?moveIn=${moveIn}&moveOut=${moveOut}`) as ApiListing[];
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((listing) => listing.availableFrom! <= moveIn && listing.availableTo! >= moveOut)).toBe(true);
    expect(getWebsiteDemoData("/listings?moveIn=2028-01-01&moveOut=2028-02-01")).toEqual([]);
    for (const query of [
      "moveIn=2026-10-01", "moveOut=2026-11-01", "moveIn=&moveOut=", "moveIn=2026-02-29&moveOut=2026-03-02",
      "moveIn=2026-02-30&moveOut=2026-03-02", "moveIn=2026-13-01&moveOut=2027-01-01",
      "moveIn=2026-10-01&moveOut=2026-10-01", "moveIn=2026-11-01&moveOut=2026-10-01",
      "moveIn=2026-10-1&moveOut=2026-11-01", "moveIn=2026-10-01&moveIn=2026-10-02&moveOut=2026-11-01"
    ]) expectStatus(`/listings?${query}`, 400);
  });

  it("paginates six clearly fictional profiles without personal contacts or portrait photos", () => {
    const first = getWebsiteDemoData("/roommates/deck?limit=2") as ApiRoommateDeckResponse;
    const second = getWebsiteDemoData("/roommates/deck?limit=2&cursor=2") as ApiRoommateDeckResponse;
    const last = getWebsiteDemoData("/roommates/deck?limit=2&cursor=4") as ApiRoommateDeckResponse;
    expect(first.pageInfo).toEqual({ cursor: 0, nextCursor: 2, limit: 2, returned: 2, totalCandidates: 6 });
    expect(last.pageInfo.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...last.items].map((profile) => profile.id)).size).toBe(6);
    expect((getWebsiteDemoData("/roommates/deck?cursor=10000") as ApiRoommateDeckResponse).items).toEqual([]);
    const listingImages = (getWebsiteDemoData("/listings") as ApiListing[]).map((listing) => listing.image);
    for (const profile of [...first.items, ...second.items, ...last.items]) {
      expect(profile.name).toContain("虚构演示");
      expect(profile.role).toContain("非实际身份");
      expect(profile.budget).toContain("USD");
      expect(profile.budget).toContain("演示预算");
      expect(profile.match).toBe(0);
      expect(listingImages).toContain(profile.image);
      expect(profile).not.toHaveProperty("email");
      expect(profile).not.toHaveProperty("phone");
    }
    expect(getWebsiteDemoData(`/roommates/deck/${first.items[0].id}`)).toMatchObject(first.items[0]);
  });

  it("applies only truthful synthetic budget, city, school and lifestyle filters", () => {
    const deck = getWebsiteDemoData("/roommates/deck?budgetMin=1200&budgetMax=1600&city=Los%20Angeles&schools=UCLA,USC&hobbies=早睡,安静") as ApiRoommateDeckResponse;
    expect(deck.items.map((profile) => profile.id)).toEqual(["demo-roommate-1"]);
    expect(deck.discovery.headline).toContain("未计算真实匹配");
    expect((getWebsiteDemoData("/roommates/deck?school=Not-A-School") as ApiRoommateDeckResponse).items).toEqual([]);
    expect((getWebsiteDemoData("/roommates/deck?city=Boston&hobby=会做饭") as ApiRoommateDeckResponse).items.map((profile) => profile.id)).toEqual(["demo-roommate-4"]);
    expectStatus("/roommates/deck?gender=Women", 400);
    expectStatus("/roommates/deck?strategy=precision", 400);
    expectStatus("/roommates/deck?school=UCLA&schools=USC", 400);
  });

  it("rejects invalid or excessive pagination and unsupported filters", () => {
    for (const query of [
      "limit=0", "limit=25", "limit=2.5", "limit=-1", "limit=1e2", "limit=",
      "cursor=-1", "cursor=10001", "cursor=9007199254740992", "cursor=1&cursor=2",
      "budgetMin=500&budgetMax=100", "budgetMax=100001", "budgetMin=NaN", "unknown=ignored"
    ]) expectStatus(`/roommates/deck?${query}`, 400);
    expectStatus("/listings?ownerId=real-person", 400);
    expectStatus("/listings/preview-01?auth=ignored", 400);
  });

  it("denies private reads and never resolves real or unknown record ids", () => {
    for (const path of [
      "/auth/me", "/auth/email-code", "/profiles/me", "/admin/roommates", "/trust/queues", "/payments/mode",
      "/demo-payments/by-application/secret", "/demo-held-funds/secret", "/applications/mine",
      "/deal-threads", "/deal-rooms/active", "/roommate-conversations", "/roommate-teams/current",
      "/trips", "/groups", "/listings/mine", "/roommates/activity", "/roommates/demo-roommate-1/actions",
      "/listings/preview-01/media/upload", "/listings/preview-01/submit"
    ]) expectStatus(path, 403);
    for (const path of ["/listings/real-listing", "/listings/preview-999", "/roommates/deck/real-person", "/roommates/deck/demo-roommate-7", "/roommates", "/unknown"]) {
      expectStatus(path, 404);
    }
  });

  it("rejects origins, malformed escapes, traversal, fragments and encoded controls", () => {
    for (const path of [
      "https://example.com/listings", "//example.com/listings", "listings", "/listings/", "/listings//preview-01",
      "/listings/../auth/me", "/listings/%2e%2e/auth/me", "/listings/%252e%252e", "/listings/%2fauth",
      "/listings/preview-01#secret", "/listings/preview-01%23secret", "/listings/preview-01\\..\\auth",
      "/listings/preview-01%5c..%5cauth", "/listings/preview-01%00", "/listings?moveIn=%0a",
      "/roommates/deck?city=%E0%A4%A", "/listings/%ZZ", "/listings\n", `/${"x".repeat(2048)}`
    ]) expectStatus(path, 404);
  });
});
