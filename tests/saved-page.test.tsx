// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SavedPageExperience } from "../components/marketplace/saved-page-experience";
import { createPreviewListings } from "../lib/preview-data";
import { getSavedCollectionsStorageKey } from "../lib/saved-collections";

vi.mock("maplibre-gl", () => import("./support/fake-maplibre"));
// MapLibre is imported after render; let that import settle.
const loadMap = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

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

  it("prices saved homes on the map and opens a card linking to the listing", async () => {
    const listing = renderSavedPage();
    fireEvent.click(screen.getByRole("button", { name: "地图" }));
    await loadMap();

    const returnToList = screen.getByRole("button", { name: "列表" });
    expect(returnToList.getAttribute("aria-pressed")).toBe("true");
    const map = screen.getByRole("region", { name: "收藏房源地图" });
    const pin = within(map).getByRole("button", { name: `${listing.title} $${listing.price.toLocaleString("en-US")}` });
    expect(pin.classList.contains("is-saved")).toBe(true);
    fireEvent.click(pin);
    expect(within(map).getByRole("link", { name: listing.title }).getAttribute("href")).toBe(`/listing/${encodeURIComponent(listing.id)}`);

    fireEvent.click(returnToList);
    expect(screen.queryByRole("region", { name: "收藏房源地图" })).toBeNull();
    expect(screen.getByRole("button", { name: "地图" }).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
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
