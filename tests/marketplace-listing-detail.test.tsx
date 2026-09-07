// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "./support/dom-test-renderer";

import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";

describe("marketplace listing detail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("makes rental application primary and keeps booking-like actions secondary", () => {
    const listing = createPreviewListings()[0];
    const html = renderToStaticMarkup(
      <SavedListingsProvider>
        <ListingDetailExperience listing={listing} />
      </SavedListingsProvider>
    );

    expect(html).toContain(listing.title);
    expect(html).toContain("申请租住");
    expect(html).toContain(`href="/applications/new?listingId=${listing.id}&amp;moveIn=`);
    expect(html).toContain("预约看房");
    expect(html).toContain("联系房东");
    expect(html).toContain("费用明细");
    expect(html).toContain("tile.openstreetmap.de");
    expect(html).toContain("© OpenStreetMap contributors");
    expect(html).not.toContain("房源位置示意地图");
    expect(html).not.toContain("立即付款");
    expect(html).not.toContain("阅读完整介绍");
  });

  it("does not prefill a move-in date that has already passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T18:00:00.000Z"));
    const listing = { ...createPreviewListings()[0], availableFrom: "2026-08-01", availableTo: "2027-08-01" };
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={listing} /></SavedListingsProvider>);

    expect(html).toContain('value="2026-09-03"');
    expect(html).toContain("2026-09-03 可入住");
    expect(html).not.toContain('value="2026-08-01"');
    expect(html).not.toContain("可 8/20 入住");
  });

  it("opens the complete photo gallery from the detail page", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <ListingDetailExperience listing={createPreviewListings()[0]} />
        </SavedListingsProvider>
      );
    });

    const openGallery = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("查看全部图片"));
    expect(openGallery).toBeDefined();
    await act(async () => openGallery!.props.onClick());

    expect(renderer.root.findByProps({ role: "dialog" })).toBeDefined();
    expect(nodeText(renderer.root)).toContain("全部图片");
    expect(nodeText(renderer.root)).toContain("1 张");
  });

  it("restores focus to the gallery trigger after closing", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <ListingDetailExperience listing={createPreviewListings()[0]} />
        </SavedListingsProvider>
      );
    });

    const openGallery = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("查看全部图片"))!;
    (openGallery.element as HTMLButtonElement).focus();
    await act(async () => openGallery.props.onClick());
    const closeGallery = renderer.root.findByProps({ "aria-label": "关闭全部图片" });
    await act(async () => closeGallery.props.onClick());

    expect(document.activeElement).toBe(openGallery.element);
  });

  it("shows only amenities supplied by the listing", () => {
    const listing = { ...createPreviewListings()[0], tags: ["带家具"] };
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={listing} /></SavedListingsProvider>);

    expect(html).toContain("带家具");
    expect(html).not.toContain("高速 Wi-Fi");
    expect(html).not.toContain("洗衣设施");
  });

  it("does not invent a host identity or response-time claim", () => {
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={createPreviewListings()[0]} /></SavedListingsProvider>);

    expect(html).not.toContain("房东 Lina");
    expect(html).not.toContain("通常 1 小时内回复");
    expect(html).not.toContain("房东资料已验证");
  });

  it("copies the listing link when native sharing is unavailable", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("location", { href: "http://localhost:3000/listing/preview-01" });
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <ListingDetailExperience listing={createPreviewListings()[0]} />
        </SavedListingsProvider>
      );
    });

    const share = renderer.root.findAllByType("button").find((button) => nodeText(button) === "分享");
    expect(share).toBeDefined();
    await act(async () => share!.props.onClick());

    expect(writeText).toHaveBeenCalledWith("http://localhost:3000/listing/preview-01");
    expect(nodeText(renderer.root)).toContain("链接已复制");
  });
});

function nodeText(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : nodeText(child)).join("");
}
