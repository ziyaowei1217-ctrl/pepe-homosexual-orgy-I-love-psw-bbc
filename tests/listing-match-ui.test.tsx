// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ListingCard } from "../components/marketplace/listing-card";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { getListingCoordinates } from "../lib/listing-map";
import { createPreviewListings, type PreviewListing } from "../lib/preview-data";
import { writeRenterPreferences, emptyRenterPreferences } from "../lib/renter-preferences";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function home(patch: Pick<PreviewListing, "id" | "title" | "area" | "commute" | "score" | "price">): PreviewListing {
  const { lat, lng } = getListingCoordinates(patch.area);
  return { ...createPreviewListings()[0], transit: "", ...patch, latitude: lat, longitude: lng };
}
const westwood = home({ id: "westwood", title: "Westwood 主卧", area: "Los Angeles · Westwood", commute: "步行 12 分钟到 UCLA", score: 4.5, price: 1700 });
const koreatown = home({ id: "koreatown", title: "Koreatown 次卧", area: "Los Angeles · Koreatown", commute: "紫线 16 分钟到 DTLA", score: 4.7, price: 1400 });
const pasadena = home({ id: "pasadena", title: "Pasadena 一居", area: "Los Angeles · Pasadena", commute: "", score: 4.9, price: 1500 });
const listings = [pasadena, koreatown, westwood];

beforeEach(() => window.history.replaceState(null, "", "/search"));
afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

function titles() {
  return screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent).filter((text) => text?.includes("房") || text?.includes("卧") || text?.includes("一居"));
}

describe("listing match on the card", () => {
  it("shows the score with the first reason the commute line does not already show", () => {
    const html = renderToStaticMarkup(<ListingCard listing={westwood} href="/listing/westwood" match={{ score: 92, reasons: ["步行 12 分钟到 UCLA", "比预算低 $300/月"], gaps: [] }} />);
    expect(html).toContain("匹配 <span class=\"font-display\">92</span>%");
    expect(html).toContain("比预算低 $300/月");
    expect(html.match(/步行 12 分钟到 UCLA/g)).toHaveLength(1);
  });

  it("hides the score when the match cannot say why", () => {
    expect(renderToStaticMarkup(<ListingCard listing={westwood} href="/x" match={{ score: 100, reasons: [], gaps: [] }} />)).not.toContain("匹配");
    expect(renderToStaticMarkup(<ListingCard listing={westwood} href="/x" match={null} />)).not.toContain("匹配");
  });
});

describe("listing match in search", () => {
  it("ranks recommended results by the saved preferences and lets the renter change them", async () => {
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    await act(async () => {
      render(<SavedListingsProvider><SearchExperience listings={listings} initialQuery="" initialMoveIn="" initialMoveOut="" /></SavedListingsProvider>);
    });

    expect(titles()).toEqual(["Westwood 主卧", "Koreatown 次卧", "Pasadena 一居"]);
    expect(screen.getByText("按匹配度排序：", { exact: false }).textContent).toContain("UCLA");
    expect(document.body.textContent).toContain("匹配 100%");
    expect(document.body.textContent).toContain("距 UCLA 约 29 公里");

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "修改匹配偏好" })));
    const dialog = screen.getByRole("dialog", { name: "匹配偏好" });
    await act(async () => {
      fireEvent.change(within(dialog).getByPlaceholderText("例如 UCLA"), { target: { value: "" } });
      fireEvent.change(within(dialog).getByLabelText("每月最高预算"), { target: { value: "1450" } });
    });
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "保存偏好" })));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(titles()).toEqual(["Koreatown 次卧", "Pasadena 一居", "Westwood 主卧"]);
    expect(JSON.parse(localStorage.getItem("sublet_renter_preferences_v1") ?? "{}").budgetMax).toBe(1450);
  });

  it("keeps the generic order and offers to set preferences when there are none", async () => {
    await act(async () => {
      render(<SavedListingsProvider><SearchExperience listings={listings} initialQuery="" initialMoveIn="" initialMoveOut="" /></SavedListingsProvider>);
    });
    expect(titles()).toEqual(["Pasadena 一居", "Koreatown 次卧", "Westwood 主卧"]);
    expect(screen.getByRole("button", { name: "设置匹配偏好" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("匹配 ");
  });
});

describe("listing match on the listing page", () => {
  it("explains the match with the search the renter came from", async () => {
    writeRenterPreferences({ ...emptyRenterPreferences, destination: "UCLA" });
    sessionStorage.setItem("sublet:last-search", "/search?priceMax=1500");
    window.history.replaceState(null, "", "/listing/westwood");
    await act(async () => {
      render(<SavedListingsProvider><ListingDetailExperience listing={westwood} listings={listings} /></SavedListingsProvider>);
    });

    const block = screen.getByRole("heading", { name: /和你的匹配度/ }).parentElement!.parentElement!;
    expect(block.textContent).toContain("和你的匹配度 71%");
    expect(block.textContent).toContain("步行 12 分钟到 UCLA");
    expect(block.textContent).toContain("超出预算 $200/月");
  });
});
