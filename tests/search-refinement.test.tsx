// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SearchExperience } from "../components/marketplace/search-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";

afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

const fixtures = createPreviewListings().slice(0, 3).map((item, index) => ({
  ...item, title: ["经济单间", "带独卫公寓", "宽敞两居"][index],
  price: [1400, 2200, 5100][index], beds: [1, 1, 2][index],
  tags: [["Wi-Fi"], ["Wi-Fi", "独卫"], ["独卫"]][index]
}));

function setup() {
  return render(<SavedListingsProvider><SearchExperience listings={fixtures} initialQuery="" initialMoveIn="" initialMoveOut="" /></SavedListingsProvider>);
}

describe("search refinement journey", () => {
  it.each([
    { trigger: "租期", label: "入住与退租", container: "section" },
    { trigger: "卧室", label: "卧室数量", container: "fieldset" }
  ])("focuses the requested $trigger section instead of starting at budget", ({ trigger, label, container }) => {
    setup();
    const opener = screen.getByRole("button", { name: trigger });
    opener.focus();
    fireEvent.click(opener);
    const section = within(screen.getByRole("dialog")).getByText(label).closest(container);
    expect(document.activeElement).toBe(section);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not silently exclude expensive homes before a budget is chosen", () => {
    setup();
    expect(screen.getByRole("heading", { name: "宽敞两居" })).toBeTruthy();
  });

  it("discards unconfirmed filters on Escape, restores focus, and commits only on apply", () => {
    setup();
    const trigger = screen.getByRole("button", { name: "筛选" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("slider", { name: "每月最高预算" }), { target: { value: "1500" } });
    expect(screen.getByRole("heading", { name: "带独卫公寓" })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("slider", { name: "每月最高预算" }), { target: { value: "1500" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "查看 1 套房源" }));
    expect(screen.queryByRole("heading", { name: "带独卫公寓" })).toBeNull();
    expect(new URLSearchParams(window.location.search).get("priceMax")).toBe("1500");
  });

  it("combines amenities and clears an individual filter without losing the others", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "筛选" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "Wi-Fi" }));
    fireEvent.click(dialog.getByRole("button", { name: "独卫" }));
    fireEvent.click(dialog.getByRole("button", { name: "查看 1 套房源" }));
    expect(screen.getByRole("heading", { name: "带独卫公寓" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "经济单间" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "移除 独卫" }));
    expect(screen.getByRole("heading", { name: "经济单间" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "宽敞两居" })).toBeNull();
  });

  it("restores criteria when navigating through browser history", () => {
    setup();
    window.history.pushState(null, "", "/search?q=Westwood&priceMax=1600&amenities=Wi-Fi&sort=price-low&view=list");
    fireEvent.popState(window);
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("Westwood");
    expect((screen.getByRole("combobox", { name: "结果排序" }) as HTMLSelectElement).value).toBe("price-low");
    expect(screen.getByRole("button", { name: "移除 Wi-Fi" })).toBeTruthy();
  });

  it("restores a search URL when returning from a detail page with cached server props", () => {
    window.history.replaceState(null, "", "/search?priceMax=1600&amenities=Wi-Fi&view=list");
    setup();
    expect(screen.getByRole("heading", { name: "经济单间" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "带独卫公寓" })).toBeNull();
    expect(screen.getByRole("button", { name: "移除 Wi-Fi" })).toBeTruthy();
  });

  it("clears dates when recovering from no results", () => {
    render(<SavedListingsProvider><SearchExperience listings={fixtures} initialQuery="" initialMoveIn="2099-01-01" initialMoveOut="2099-02-01" /></SavedListingsProvider>);
    fireEvent.click(screen.getByRole("button", { name: "清除筛选" }));
    expect(screen.getByRole("heading", { name: "经济单间" })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has("moveIn")).toBe(false);
  });

  it("excludes undated listings instead of silently disabling the selected stay dates", () => {
    render(<SavedListingsProvider><SearchExperience listings={[
      { ...fixtures[0], availableFrom: "2026-10-01", availableTo: "2027-01-01" },
      { ...fixtures[1], availableFrom: "", availableTo: "" }
    ]} initialQuery="" initialMoveIn="2026-11-01" initialMoveOut="2026-12-01" /></SavedListingsProvider>);
    expect(screen.getByRole("heading", { name: "经济单间" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "带独卫公寓" })).toBeNull();
  });
});
