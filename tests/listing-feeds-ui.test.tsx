// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { HomeFeeds } from "../components/marketplace/listing-feeds";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { createPreviewListings } from "../lib/preview-data";
import { defaultSearch } from "../lib/search-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const now = Date.parse("2026-10-22T19:00:00Z");
const listings = createPreviewListings();
const signalsKey = "sublet_feed_signals_v1";
const readSignals = () => JSON.parse(localStorage.getItem(signalsKey) ?? "null");
const writeSignals = (signals: object) => localStorage.setItem(signalsKey, JSON.stringify(signals));
const areaOf = (href: string | null) => listings.find((listing) => href?.startsWith(`/listing/${listing.id}`))?.area ?? "";

const cardLinks = (region: HTMLElement) => within(region).getAllByRole("article").map((card) => within(card).getAllByRole("link")[0].getAttribute("href"));
const openedSearch = () => new URLSearchParams(sessionStorage.getItem("sublet:last-search")?.split("?")[1] ?? "");

/** Clicks a card's link the way a renter opens it, without jsdom trying to navigate. */
function openCard(card: HTMLElement) {
  const stayOnPage = (event: Event) => event.preventDefault();
  window.addEventListener("click", stayOnPage);
  fireEvent.click(within(card).getAllByRole("link")[0]);
  window.removeEventListener("click", stayOnPage);
}

async function renderInProvider(element: React.ReactElement) {
  await act(async () => {
    render(<SavedListingsProvider>{element}</SavedListingsProvider>);
  });
}

// The preview catalog has fixed dates; pin today so its listings stay bookable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

describe("home feeds", () => {
  it("continues the last search and shows recently viewed homes, which can be forgotten", async () => {
    writeSignals({ viewedIds: ["preview-03"], lastSearch: "/search?q=Boston" });
    await renderInProvider(<HomeFeeds listings={listings} now={now} />);

    const picks = screen.getByRole("region", { name: "为你推荐" });
    expect(picks.textContent).toContain("上次搜索「Boston」的结果");
    const picked = cardLinks(picks);
    expect(picked.length).toBeGreaterThan(0);
    expect(picked.every((href) => areaOf(href).startsWith("Boston"))).toBe(true);
    expect(within(picks).getByRole("link", { name: /查看上次搜索/ }).getAttribute("href")).toBe("/search?q=Boston");
    const recent = screen.getByRole("region", { name: "最近浏览" });
    expect(cardLinks(recent)).toEqual(["/listing/preview-03"]);
    openCard(within(recent).getByRole("article"));
    expect(openedSearch().get("q")).toBe("Boston");
    expect(openedSearch().get("selected")).toBe("preview-03");

    await act(async () => fireEvent.click(within(recent).getByRole("button", { name: "清除记录" })));
    expect(screen.queryByRole("region", { name: "最近浏览" })).toBeNull();
    expect(readSignals().viewedIds).toEqual([]);
    expect(document.activeElement?.textContent).toBe("为你推荐");
  });

  it("prices cards for the last search's dates and opens them as that search would", async () => {
    writeSignals({ viewedIds: [], lastSearch: "/search?q=Boston&moveIn=2026-11-01&moveOut=2027-01-15" });
    await renderInProvider(<HomeFeeds listings={listings} now={now} />);

    const picks = screen.getByRole("region", { name: "为你推荐" });
    const [href] = cardLinks(picks);
    expect(href).toMatch(/\?moveIn=2026-11-01&moveOut=2027-01-15$/);
    expect(picks.textContent).not.toContain("/ 月");
    openCard(within(picks).getAllByRole("article")[0]);
    const opened = openedSearch();
    expect(opened.get("q")).toBe("Boston");
    expect(href).toContain(`/listing/${opened.get("selected")}?`);
  });

  it("shows 精选房源 before there is anything to go on, and a saved card stays where it is", async () => {
    await renderInProvider(<HomeFeeds listings={listings} now={now} />);
    const picks = screen.getByRole("region", { name: "精选房源" });
    expect(within(picks).getAllByRole("article")).toHaveLength(8);
    expect(screen.queryByRole("region", { name: "最近浏览" })).toBeNull();

    const before = cardLinks(picks);
    const [first] = within(picks).getAllByRole("article");
    await act(async () => fireEvent.click(within(first).getByRole("button", { name: /^收藏 / })));
    expect(cardLinks(screen.getByRole("region", { name: "精选房源" }))).toEqual(before);
    expect(within(first).getByRole("button", { name: /^取消收藏 / })).toBeTruthy();
    // With no last search, opening a card replaces any older stored search, so its page scores as the card did.
    sessionStorage.setItem("sublet:last-search", "/search?q=Boston&selected=preview-01");
    openCard(first);
    expect(sessionStorage.getItem("sublet:last-search")).toBe(`/search?selected=${before[0]!.split("/")[2]}`);
  });
});

describe("listing page", () => {
  it("records the view and lists similar homes in the same city", async () => {
    const boston = listings.find((listing) => listing.id === "preview-25")!;
    window.history.replaceState(null, "", "/listing/preview-25");
    await renderInProvider(<ListingDetailExperience listing={boston} listings={listings} />);

    expect(readSignals().viewedIds).toEqual(["preview-25"]);
    const links = cardLinks(screen.getByRole("region", { name: "相似房源" }));
    expect(links.length).toBeGreaterThan(0);
    expect(links).not.toContain("/listing/preview-25");
    expect(links.every((href) => areaOf(href).startsWith("Boston"))).toBe(true);
  });
});

describe("search page", () => {
  const renderSearch = (state: typeof defaultSearch, url: string) => {
    window.history.replaceState(null, "", url);
    return renderInProvider(<SearchExperience listings={listings} initialState={state} initialQuery={state.query} initialMoveIn="" initialMoveOut="" />);
  };

  it("remembers what was searched for the home page once typing settles, and forgets it when cleared", async () => {
    await renderSearch({ ...defaultSearch, query: "Boston", view: "list" }, "/search?q=Boston&view=list");
    await waitFor(() => expect(readSignals()?.lastSearch).toBe("/search?q=Boston"));

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "清除地点" })));
    expect(readSignals().lastSearch).toBe("/search?q=Boston");
    await waitFor(() => expect(readSignals().lastSearch).toBe(""));
  });

  it("keeps the search at once when a result is opened", async () => {
    await renderSearch({ ...defaultSearch, query: "Boston", view: "list" }, "/search?q=Boston&view=list");
    expect(readSignals()).toBeNull();
    openCard(screen.getAllByRole("article")[0]);
    expect(readSignals().lastSearch).toBe("/search?q=Boston");
  });

  it("keeps the previous search when /search is reached with no conditions, by link or by 找房", async () => {
    writeSignals({ viewedIds: [], lastSearch: "/search?q=Austin" });
    await renderSearch({ ...defaultSearch, view: "list" }, "/search?view=list");
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(readSignals().lastSearch).toBe("/search?q=Austin");

    cleanup();
    const search = (state: typeof defaultSearch) => <SavedListingsProvider><SearchExperience listings={listings} initialState={state} initialQuery={state.query} initialMoveIn="" initialMoveOut="" /></SavedListingsProvider>;
    window.history.replaceState(null, "", "/search?q=Boston&view=list");
    let rerender: (element: React.ReactElement) => void = () => undefined;
    await act(async () => { ({ rerender } = render(search({ ...defaultSearch, query: "Boston", view: "list" }))); });
    await waitFor(() => expect(readSignals().lastSearch).toBe("/search?q=Boston"));
    window.history.pushState(null, "", "/search");
    await act(async () => rerender(search({ ...defaultSearch, view: "list" })));
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(readSignals().lastSearch).toBe("/search?q=Boston");
  });
});
