// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SearchExperience } from "../components/marketplace/search-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";
import { defaultSearch, parseSearchState, type SearchState } from "../lib/search-state";

const route = vi.hoisted(() => ({ query: null as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => route.query === null ? null : new URLSearchParams(route.query)
}));

const listings = createPreviewListings();
const view = (initialState: SearchState = { ...defaultSearch }) =>
  <SavedListingsProvider><SearchExperience listings={listings} initialQuery={initialState.query} initialMoveIn={initialState.moveIn} initialMoveOut={initialState.moveOut} initialState={initialState} /></SavedListingsProvider>;

beforeEach(() => {
  route.query = null;
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

describe("search App Router query synchronization", () => {
  it("initializes a new destination from server criteria before the old browser URL commits", () => {
    window.history.replaceState(null, "", "/search?q=Boston");
    render(view());
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "全部地区的可租房源" })).toBeTruthy();
  });

  it("clears reused Boston criteria when a Next Link changes to the plain search route without popstate", () => {
    route.query = "q=Boston&view=list";
    window.history.replaceState(null, "", `/search?${route.query}`);
    const initial = parseSearchState(new URLSearchParams(route.query));
    const page = render(view(initial));
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("Boston");

    window.history.replaceState(null, "", "/search");
    route.query = "";
    page.rerender(view(initial));
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("heading", { name: "全部地区的可租房源" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "分屏" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("restores destination dates, budget, amenities and map view from a changed router snapshot", () => {
    route.query = "q=Boston&view=list";
    window.history.replaceState(null, "", `/search?${route.query}`);
    const initial = parseSearchState(new URLSearchParams(route.query));
    const page = render(view(initial));

    route.query = "q=Seattle&moveIn=2026-10-10&moveOut=2026-11-10&priceMax=2600&amenities=Wi-Fi&view=map";
    window.history.replaceState(null, "", `/search?${route.query}`);
    page.rerender(view(initial));
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("Seattle");
    expect(screen.getByRole("button", { name: "地图" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "移除 Wi-Fi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除 10/10 – 11/10" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除 $0 – $2,600" })).toBeTruthy();
  });

  it("normalizes a query reset to the visible list view on phones", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    route.query = "q=Boston&view=map";
    window.history.replaceState(null, "", `/search?${route.query}`);
    const initial = parseSearchState(new URLSearchParams(route.query));
    const page = render(view(initial));
    route.query = "";
    window.history.replaceState(null, "", "/search");
    page.rerender(view(initial));
    expect(screen.getByRole("button", { name: "列表" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "地图" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps in-progress location text when the router observes this component's native history write", () => {
    route.query = "";
    window.history.replaceState(null, "", "/search");
    const page = render(view());
    fireEvent.change(screen.getByRole("combobox", { name: "地点或学校" }), { target: { value: "San " } });
    expect(new URLSearchParams(window.location.search).get("q")).toBe("San");
    route.query = new URLSearchParams(window.location.search).toString();
    page.rerender(view());
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("San ");
  });

  it("switches hidden split to list when the viewport narrows without clearing criteria and cleans up its listener", () => {
    let narrow = false;
    const listeners = new Set<() => void>();
    const viewport = {
      get matches() { return narrow; },
      addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener))
    };
    vi.stubGlobal("matchMedia", vi.fn(() => viewport));
    const initial = { ...defaultSearch, query: "Boston", priceMax: 2200, moveIn: "2026-10-10", moveOut: "2026-11-10" };
    window.history.replaceState(null, "", "/search?q=Boston&priceMax=2200&moveIn=2026-10-10&moveOut=2026-11-10");
    const beforeUrl = window.location.href;
    const page = render(view(initial));
    expect(screen.getByRole("button", { name: "分屏" }).getAttribute("aria-pressed")).toBe("true");
    act(() => { narrow = true; listeners.forEach(listener => listener()); });
    expect(screen.getByRole("button", { name: "列表" }).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("combobox", { name: "地点或学校" }) as HTMLInputElement).value).toBe("Boston");
    expect(screen.getByRole("button", { name: "移除 $0 – $2,200" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "移除 10/10 – 11/10" })).toBeTruthy();
    expect(window.location.href).toBe(beforeUrl);
    page.unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(listeners.size).toBe(0);
  });
});
