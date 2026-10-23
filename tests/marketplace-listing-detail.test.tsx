// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "./support/dom-test-renderer";

import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { earliestListingDate } from "../lib/listing-stay";
import { createPreviewListings } from "../lib/preview-data";

describe("marketplace listing detail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("makes rental application primary and keeps booking-like actions secondary", () => {
    const listing = createPreviewListings()[0];
    const stay = { moveIn: earliestListingDate(listing), moveOut: listing.availableTo.slice(0, 10) };
    const html = renderToStaticMarkup(
      <SavedListingsProvider>
        <ListingDetailExperience listing={listing} initialStay={stay} />
      </SavedListingsProvider>
    );

    expect(html).toContain(listing.title);
    expect(html).toContain("申请租住");
    expect(html).toContain(`href="/applications/new?listingId=${listing.id}&amp;moveIn=`);
    expect(html).toContain("预约看房");
    expect(html).toContain("联系转租人");
    expect(html).toContain("费用明细");
    expect(html).toContain('aria-label="房源位置地图"');
    expect(html).toContain("地图显示大致位置");
    expect(html).not.toContain("房源位置示意地图");
    expect(html).not.toContain("立即付款");
    expect(html).not.toContain("阅读完整介绍");
  });

  it("never picks dates for the renter and asks for them instead", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T18:00:00.000Z"));
    const listing = { ...createPreviewListings()[0], availableFrom: "2026-08-01", availableTo: "2027-08-01" };
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={listing} /></SavedListingsProvider>);

    // No dates filled in, no total, no "your dates can be applied for": the monthly rent and a prompt for dates.
    expect(html).not.toContain('value="2026-');
    expect(html).not.toContain("这段日期可以申请");
    expect(html).not.toContain("房租总价");
    expect(html).toContain("选好入住和退租日期，这里就是这段日期的总价。");
    expect(html).toContain("选择日期");
    // The earliest date offered is today, not a start date that has already passed.
    expect(html).toContain('min="2026-09-03"');
    expect(html).toContain("9月3日起可入住");
    expect(html).not.toContain('role="alert"');
  });

  it("opens the complete photo gallery from the detail page", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <SavedListingsProvider>
          <ListingDetailExperience listing={{ ...createPreviewListings()[0], images: ["https://images.example/one.jpg", "https://images.example/two.jpg", "https://images.example/three.jpg"] }} />
        </SavedListingsProvider>
      );
    });

    const openGallery = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("查看全部 3 张"));
    expect(openGallery).toBeDefined();
    await act(async () => openGallery!.props.onClick());

    expect(renderer.root.findByProps({ role: "dialog" })).toBeDefined();
    expect(nodeText(renderer.root)).toContain("全部图片");
    expect(nodeText(renderer.root)).toContain("3 张");
  });

  it("offers a single photo as a larger view instead of a gallery of one", () => {
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={createPreviewListings()[0]} /></SavedListingsProvider>);
    expect(html).toContain("放大看照片");
    expect(html).not.toContain("查看全部");
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

    const openGallery = renderer.root.findAllByType("button").find((button) => nodeText(button).includes("放大看照片"))!;
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
