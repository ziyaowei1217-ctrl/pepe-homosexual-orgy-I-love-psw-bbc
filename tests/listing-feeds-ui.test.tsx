// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { HomeFeeds } from "../components/marketplace/listing-feeds";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { feedSignalsStorageKey } from "../lib/feed-signals";
import { createPreviewListings } from "../lib/preview-data";
import { defaultSearch } from "../lib/search-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = Date.parse("2026-10-22T19:00:00Z");
const listings = createPreviewListings();
const guestSignals = feedSignalsStorageKey("guest");
const readSignals = () => JSON.parse(localStorage.getItem(guestSignals) ?? "null");

const cardLinks = (region: HTMLElement) => within(region).getAllByRole("article").map((card) => within(card).getByRole("link").getAttribute("href"));

async function renderInProvider(element: React.ReactElement) {
  await act(async () => {
    render(<SavedListingsProvider>{element}</SavedListingsProvider>);
  });
}

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("home feeds", () => {
  it("picks up the last search and recently viewed homes on this device, and can forget the views", async () => {
    localStorage.setItem(guestSignals, JSON.stringify({ version: 1, viewedIds: ["preview-03"], lastSearch: "/search?q=Boston" }));
    await renderInProvider(<HomeFeeds listings={listings} totalListings={listings.length} now={now} />);

    const picks = screen.getByRole("region", { name: "为你推荐" });
    expect(within(picks).getAllByRole("heading", { level: 3 })[0].textContent).toContain("Back Bay");
    const picked = cardLinks(picks);
    expect(picked.slice(0, 6).every((href) => listings.find((listing) => `/listing/${listing.id}` === href)?.area.startsWith("Boston"))).toBe(true);
    expect(picked).not.toContain("/listing/preview-03");
    const recent = screen.getByRole("region", { name: "最近浏览" });
    expect(cardLinks(recent)).toEqual(["/listing/preview-03"]);

    await act(async () => fireEvent.click(within(recent).getByRole("button", { name: "清除记录" })));
    expect(screen.queryByRole("region", { name: "最近浏览" })).toBeNull();
    expect(readSignals().viewedIds).toEqual([]);
  });

  it("shows 精选房源 with a save button on each card before there is anything to go on", async () => {
    await renderInProvider(<HomeFeeds listings={listings} totalListings={listings.length} now={now} />);
    const picks = screen.getByRole("region", { name: "精选房源" });
    expect(within(picks).getAllByRole("article")).toHaveLength(8);
    expect(within(picks).getAllByRole("button", { name: /^收藏 / })).toHaveLength(8);
    expect(screen.queryByRole("region", { name: "最近浏览" })).toBeNull();
  });
});

describe("listing page", () => {
  it("records the view and lists similar homes in the same city", async () => {
    const boston = listings.find((listing) => listing.id === "preview-25")!;
    window.history.replaceState(null, "", "/listing/preview-25");
    await renderInProvider(<ListingDetailExperience listing={boston} listings={listings} />);

    expect(readSignals().viewedIds).toEqual(["preview-25"]);
    const similar = screen.getByRole("region", { name: "相似房源" });
    const links = cardLinks(similar);
    expect(links.length).toBeGreaterThan(0);
    expect(links).not.toContain("/listing/preview-25");
    for (const href of links) {
      expect(listings.find((listing) => `/listing/${listing.id}` === href)?.area.startsWith("Boston")).toBe(true);
    }
  });
});

describe("search page", () => {
  it("remembers what was searched for the home feeds", async () => {
    window.history.replaceState(null, "", "/search?q=Boston&view=list");
    await renderInProvider(<SearchExperience listings={listings} initialState={{ ...defaultSearch, query: "Boston", view: "list" }} initialQuery="Boston" initialMoveIn="" initialMoveOut="" />);
    expect(readSignals().lastSearch).toBe("/search?q=Boston");
  });
});
