// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SavedMap, SavedPageExperience } from "../components/marketplace/saved-page-experience";
import { createPreviewListings } from "../lib/preview-data";
import { getSavedCollectionsStorageKey } from "../lib/saved-collections";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

function renderSavedPage() {
  const listing = createPreviewListings()[0];
  localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({
    version: 1,
    collections: [{ id: "all", name: "全部收藏", listingIds: [listing.id] }],
    notes: {}
  }));
  render(<SavedListingsProvider><SavedPageExperience listings={[listing]} /></SavedListingsProvider>);
  return listing;
}

function openCollectionDialog() {
  renderSavedPage();
  const opener = screen.getByRole("button", { name: "新建清单" });
  opener.focus();
  fireEvent.click(opener);
  return { opener, dialog: screen.getByRole("dialog", { name: "新建清单" }) };
}

describe("saved page", () => {
  it("uses a dedicated collection workspace with a purposeful empty state", () => {
    const html = renderToStaticMarkup(
      <SavedListingsProvider>
        <SavedPageExperience listings={createPreviewListings()} />
      </SavedListingsProvider>
    );

    expect(html).toContain("收藏清单");
    expect(html).toContain("全部收藏");
    expect(html).toContain("新建清单");
    expect(html).toContain("还没有收藏房源");
    expect(html).toContain('href="/search"');
    expect(html).not.toContain("完整筛选");
  });

  it("renders saved homes on the configured map instead of an illustration", () => {
    const listings = createPreviewListings().slice(0, 2).map((listing) => ({
      ...listing, latitude: 34.0635, longitude: -118.4455
    }));
    const html = renderToStaticMarkup(<SavedMap listings={listings} />);

    expect(html).toContain("tile.openstreetmap.de");
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).toContain("2 套收藏房源");
  });

  it("keeps actual Westwood and Koreatown homes individually selectable at their distinct positions", () => {
    const listings = createPreviewListings().slice(0, 2);
    render(<SavedMap listings={listings} />);
    const map = screen.getByRole("complementary", { name: "收藏房源地图" });
    const links = within(map).getAllByRole("link");
    expect(links).toHaveLength(2);
    for (const listing of listings) {
      expect(within(map).getByRole("link", { name: `查看 ${listing.title} $${listing.price.toLocaleString()} / 月` }).getAttribute("href"))
        .toBe(`/listing/${encodeURIComponent(listing.id)}`);
    }
    expect(within(map).queryByRole("button", { name: /此区域.*收藏房源/ })).toBeNull();
    expect(links[0].style.left).not.toBe(links[1].style.left);
  });

  it("offers a list return action after opening the saved map and keeps listing navigation available", () => {
    const listing = renderSavedPage();
    fireEvent.click(screen.getByRole("button", { name: "地图" }));

    const returnToList = screen.getByRole("button", { name: "列表" });
    expect(returnToList.getAttribute("aria-pressed")).toBe("true");
    const map = screen.getByRole("complementary", { name: "收藏房源地图" });
    expect(within(map).getByRole("link", { name: `查看 ${listing.title} $${listing.price.toLocaleString()} / 月` }).getAttribute("href"))
      .toBe(`/listing/${encodeURIComponent(listing.id)}`);

    fireEvent.click(returnToList);
    expect(screen.queryByRole("complementary", { name: "收藏房源地图" })).toBeNull();
    expect(screen.getByRole("button", { name: "地图" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
  });

  it("keeps saved markers aligned with tile coordinates when the map resizes", () => {
    let resize: (entries: ResizeObserverEntry[]) => void = () => {};
    vi.stubGlobal("ResizeObserver", class implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize = (entries) => callback(entries, this);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    const listings = createPreviewListings().slice(0, 2).map((listing, index) => ({
      ...listing, latitude: 0, longitude: index === 0 ? -0.04 : 0.04
    }));
    render(<SavedMap listings={listings} />);
    const map = screen.getByRole("complementary", { name: "收藏房源地图" });
    const westernMarker = within(map).getByRole("link", { name: /\$995/ });
    function setMapSize(width: number, height: number) {
      act(() => resize([{
        target: map,
        contentRect: new DOMRect(0, 0, width, height),
        borderBoxSize: [], contentBoxSize: [], devicePixelContentBoxSize: []
      }]));
    }

    // At zoom 11, 0.04° longitude spans approximately 58.25 pixels; these targets stay separate.
    setMapSize(358, 480);
    expect(westernMarker.style.left).toBe("121px");
    expect(westernMarker.style.top).toBe("240px");

    setMapSize(720, 620);
    expect(westernMarker.style.left).toBe("302px");
    expect(westernMarker.style.top).toBe("310px");
  });

  it("closes the collection dialog with Escape and restores the opener focus", () => {
    const { opener, dialog } = openCollectionDialog();
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "新建清单" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("wraps keyboard focus at both ends of the collection dialog and contains background focus", () => {
    const { opener, dialog } = openCollectionDialog();
    const first = within(dialog).getByRole("button", { name: "关闭" });
    const last = within(dialog).getByRole("button", { name: "创建清单" });

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    opener.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("locks background scrolling only while the collection dialog is open", () => {
    document.body.style.overflow = "auto";
    const { dialog } = openCollectionDialog();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(within(dialog).getByRole("button", { name: "关闭" }));
    expect(document.body.style.overflow).toBe("auto");
  });
});
