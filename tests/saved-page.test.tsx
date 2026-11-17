// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SavedPageExperience } from "../components/marketplace/saved-page-experience";
import { createPreviewListings } from "../lib/preview-data";
import { MAX_SAVED_COLLECTIONS, getSavedCollectionsStorageKey } from "../lib/saved-collections";

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

  it("deletes one of the renter's own lists after asking, and keeps its homes saved", async () => {
    const listing = createPreviewListings()[0];
    localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({
      version: 1,
      collections: [{ id: "all", name: "全部收藏", listingIds: [] }, { id: "trip", name: "九月入住", listingIds: [listing.id] }],
      notes: {}
    }));
    render(<SavedListingsProvider><SavedPageExperience listings={[listing]} /></SavedListingsProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /^九月入住/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除清单" }));
    const dialog = screen.getByRole("alertdialog", { name: "删除清单「九月入住」？" });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "删除清单" })));

    expect(screen.queryByRole("button", { name: /^九月入住/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^全部收藏/ }).getAttribute("aria-pressed")).toBe("true");
    // 全部收藏 itself cannot be deleted.
    expect(screen.queryByRole("button", { name: "删除清单" })).toBeNull();
    expect(screen.getByRole("heading", { name: listing.title })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(getSavedCollectionsStorageKey(null))!).collections).toEqual([
      { id: "all", name: "全部收藏", listingIds: [listing.id] }
    ]);
  });

  it("makes lists up to the account's limit, then says how to make room", async () => {
    const lists = Array.from({ length: MAX_SAVED_COLLECTIONS - 2 }, (_, index) => ({ id: `list-${index}`, name: `清单 ${index}`, listingIds: [] }));
    localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({
      version: 1,
      collections: [{ id: "all", name: "全部收藏", listingIds: [] }, ...lists],
      notes: {}
    }));
    render(<SavedListingsProvider><SavedPageExperience listings={[]} /></SavedListingsProvider>);
    await screen.findByRole("button", { name: /^清单 47/ });

    fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
    let dialog = screen.getByRole("dialog", { name: "新建清单" });
    expect(within(dialog).queryByRole("status")).toBeNull();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "最后一个" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建清单" }));
    expect(await screen.findByRole("button", { name: /^最后一个/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
    dialog = screen.getByRole("dialog", { name: "新建清单" });
    expect(within(dialog).getByRole("status").textContent).toBe(`最多保存 ${MAX_SAVED_COLLECTIONS} 个清单（含全部收藏），现在有 ${MAX_SAVED_COLLECTIONS} 个。删掉 1 个不用的清单后再新建。`);
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "创建清单" }).disabled).toBe(true);
  });

  it("keeps the dialog open and says why when a list with that name already exists", async () => {
    localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({
      version: 1,
      collections: [{ id: "all", name: "全部收藏", listingIds: [] }, { id: "collection-九月入住", name: "九月入住", listingIds: [] }],
      notes: {}
    }));
    render(<SavedListingsProvider><SavedPageExperience listings={[]} /></SavedListingsProvider>);
    await screen.findByRole("button", { name: /^九月入住/ });
    fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
    const dialog = screen.getByRole("dialog", { name: "新建清单" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: " 九月入住 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建清单" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("已经有叫「九月入住」的清单了，换个名字再新建。");
    expect(within(dialog).getByRole<HTMLInputElement>("textbox").value).toBe(" 九月入住 ");
    expect(JSON.parse(localStorage.getItem(getSavedCollectionsStorageKey(null))!).collections).toHaveLength(2);

    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "九月入住 2" } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "创建清单" }));
    expect(await screen.findByRole("button", { name: /^九月入住 2/ })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("makes lists named in other scripts or with only emoji, and explains a name too close to an existing list", async () => {
    renderSavedPage();
    const names = ["すみか", "Квартира", "🏠", "A B", "Café"];
    for (const name of names) {
      fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
      fireEvent.change(within(screen.getByRole("dialog", { name: "新建清单" })).getByRole("textbox"), { target: { value: name } });
      fireEvent.click(screen.getByRole("button", { name: "创建清单" }));
      expect(await screen.findByRole("button", { name: (accessibleName) => accessibleName.startsWith(`${name} `) })).toBeTruthy();
      expect(screen.queryByRole("dialog")).toBeNull();
    }
    const stored = () => JSON.parse(localStorage.getItem(getSavedCollectionsStorageKey(null))!).collections as { id: string; name: string }[];
    expect(stored().map((collection) => collection.name)).toEqual(["全部收藏", ...names]);
    // Ids depend only on the name, and names that already worked keep the ids they had ("Café" was always collection-caf).
    expect(stored().map((collection) => collection.id)).toEqual(["all", "collection-すみか", "collection-квартира", "collection-u+1f3e0", "collection-a-b", "collection-caf"]);

    fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
    const dialog = screen.getByRole("dialog", { name: "新建清单" });
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "a-b" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建清单" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("「a-b」会和已有的清单「A B」存成同一个清单，换个名字再新建。");
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "全部收藏" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建清单" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("已经有叫「全部收藏」的清单了，换个名字再新建。");
    expect(stored()).toHaveLength(names.length + 1);
  });

  it("says how many lists to delete when a merge left more than the limit", async () => {
    const lists = Array.from({ length: MAX_SAVED_COLLECTIONS + 1 }, (_, index) => ({ id: `list-${index}`, name: `清单 ${index}`, listingIds: [] }));
    localStorage.setItem(getSavedCollectionsStorageKey(null), JSON.stringify({
      version: 1,
      collections: [{ id: "all", name: "全部收藏", listingIds: [] }, ...lists],
      notes: {}
    }));
    render(<SavedListingsProvider><SavedPageExperience listings={[]} /></SavedListingsProvider>);
    await screen.findByRole("button", { name: /^清单 50/ });
    fireEvent.click(screen.getByRole("button", { name: "新建清单" }));
    const dialog = screen.getByRole("dialog", { name: "新建清单" });
    expect(within(dialog).getByRole("status").textContent).toContain(`现在有 ${MAX_SAVED_COLLECTIONS + 2} 个。删掉 3 个不用的清单后再新建。`);
    expect(within(dialog).getByRole<HTMLButtonElement>("button", { name: "创建清单" }).disabled).toBe(true);
  });
});
