// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import TestRenderer, { act } from "./support/dom-test-renderer";

import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { createPreviewListings } from "../lib/preview-data";
import { defaultSearch } from "../lib/search-state";

describe("marketplace search", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));
  it("keeps results and map together without exposing unrelated workflows", () => {
    const html = renderToStaticMarkup(
      <SavedListingsProvider>
        <SearchExperience
          listings={createPreviewListings()}
          initialState={{ ...defaultSearch, query: "Westwood", selected: "preview-01" }}
          initialQuery="Westwood"
          initialMoveIn=""
          initialMoveOut=""
        />
      </SavedListingsProvider>
    );

    expect(html).toContain("Westwood的可租房源");
    expect(html).not.toContain("Westwood 的可租房源");
    expect(html).toContain("房源列表");
    expect(html).toContain('aria-label="房源地图"');
    expect(html).toContain("tile.openstreetmap.de");
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).not.toContain("示意地图");
    expect(html).toContain('href="/listing/preview-01"');
    expect(html).toContain(">筛选<");
    expect(html).toContain("bottom-[136px]");
    expect(html).not.toContain("申请材料");
    expect(html).not.toContain("室友偏好");
  });

  it("labels the budget control inside the filter panel", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <SearchExperience listings={createPreviewListings()} initialQuery="" initialMoveIn="" initialMoveOut="" />
        </SavedListingsProvider>
      );
    });
    const filterButton = renderer.root.findAllByType("button").find((button) => nodeText(button) === "筛选");
    await act(async () => filterButton!.props.onClick());

    const budget = renderer.root.findAllByType("input").find((input) => input.props.type === "range");
    expect(budget?.props["aria-label"]).toBe("每月最高预算");
  });

  it("suggests Boston from Bos and switches the visible listings and map after selection", async () => {
    const [losAngelesListing] = createPreviewListings();
    const bostonListing = {
      ...losAngelesListing,
      id: "boston-back-bay",
      title: "Back Bay 阳光一居",
      area: "Boston · Back Bay"
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <SearchExperience
            listings={[losAngelesListing, bostonListing]}
            initialQuery=""
            initialMoveIn=""
            initialMoveOut=""
          />
        </SavedListingsProvider>
      );
    });

    const locationInput = renderer.root.findAllByType("input").find((input) => input.props["aria-label"] === "地点或学校");
    expect(locationInput).toBeDefined();
    if (!locationInput) return;
    await act(async () => {
      fireEvent.focus(locationInput.element);
      fireEvent.change(locationInput.element, { target: { value: "Bos" } });
    });

    const suggestion = renderer.root.findAllByProps({ role: "option" }).find((option) => nodeText(option).includes("Boston"));
    expect(suggestion).toBeDefined();
    if (!suggestion) return;

    await act(async () => suggestion.props.onClick());

    const pageText = nodeText(renderer.root);
    expect(pageText).toContain("Boston的可租房源");
    expect(pageText).toContain("Back Bay 阳光一居");
    expect(pageText).not.toContain(losAngelesListing.title);
    expect(pageText).toContain("1 个地图结果");
  });

  it("lets keyboard users choose a location suggestion with ArrowDown and Enter", async () => {
    const [losAngelesListing] = createPreviewListings();
    const bostonListing = {
      ...losAngelesListing,
      id: "boston-fenway",
      title: "Fenway 学生公寓",
      area: "Boston · Fenway"
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <SearchExperience listings={[losAngelesListing, bostonListing]} initialQuery="" initialMoveIn="" initialMoveOut="" />
        </SavedListingsProvider>
      );
    });

    let input = renderer.root.findByProps({ role: "combobox", "aria-label": "地点或学校" });
    await act(async () => {
      fireEvent.focus(input.element);
      fireEvent.change(input.element, { target: { value: "Bos" } });
    });
    input = renderer.root.findByProps({ role: "combobox", "aria-label": "地点或学校" });
    expect(input.props["aria-expanded"]).toBe("true");
    await act(async () => fireEvent.keyDown(input.element, { key: "ArrowDown" }));
    input = renderer.root.findByProps({ role: "combobox", "aria-label": "地点或学校" });
    await act(async () => fireEvent.keyDown(input.element, { key: "Enter" }));

    expect(nodeText(renderer.root)).toContain("Boston的可租房源");
  });

  it("resolves a major employer to its metro and keeps listings and map in sync", async () => {
    const [losAngelesListing] = createPreviewListings();
    const seattleListing = {
      ...losAngelesListing,
      id: "seattle-south-lake-union",
      title: "South Lake Union 科技通勤一居",
      area: "Seattle · South Lake Union",
      commute: "步行 8 分钟到 Amazon"
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <SearchExperience listings={[losAngelesListing, seattleListing]} initialQuery="" initialMoveIn="" initialMoveOut="" />
        </SavedListingsProvider>
      );
    });

    const input = renderer.root.findByProps({ role: "combobox", "aria-label": "地点或学校" });
    await act(async () => {
      fireEvent.focus(input.element);
      fireEvent.change(input.element, { target: { value: "Amazon" } });
    });

    const suggestion = renderer.root.findAllByProps({ role: "option" }).find((option) => nodeText(option).includes("Seattle"));
    expect(suggestion).toBeDefined();
    if (!suggestion) return;
    expect(nodeText(suggestion)).toContain("Amazon");

    await act(async () => fireEvent.click(suggestion.element));

    const pageText = nodeText(renderer.root);
    expect(pageText).toContain("Seattle的可租房源");
    expect(pageText).toContain("South Lake Union 科技通勤一居");
    expect(pageText).not.toContain(losAngelesListing.title);
    expect(pageText).toContain("1 个地图结果");
  });
});

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : nodeText(child)).join("");
}
