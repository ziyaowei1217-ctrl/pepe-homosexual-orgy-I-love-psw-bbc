// @vitest-environment jsdom
// The third design review: dead ends inside the shell, honest trust copy, dates the page never picks,
// the same dates and total on the application, and errors next to their fields.

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFound from "../app/not-found";
import { ApplicationFormExperience } from "../components/marketplace/application-experiences";
import { ListingDetailExperience } from "../components/marketplace/listing-detail-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { SearchExperience } from "../components/marketplace/search-experience";
import { requestedListingStay } from "../lib/listing-stay";
import { listingTrust } from "../lib/listing-trust";
import { createPreviewListings } from "../lib/preview-data";

const listing = { ...createPreviewListings()[0], availableFrom: "2026-09-01", availableTo: "2027-06-01" };

afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); vi.useRealTimers(); window.history.replaceState(null, "", "/"); });

describe("dead ends", () => {
  it("keeps a missing page inside the site with a way forward", () => {
    const html = renderToStaticMarkup(<NotFound />);
    expect(html).toContain("这个页面不存在");
    expect(html).toContain('aria-label="主导航"');
    expect(html).toContain('href="/search"');
    expect(html).toContain('href="/"');
    expect(html).not.toContain("This page could not be found");
  });
});

describe("trust copy", () => {
  it("reads only what the platform knows", () => {
    expect(listingTrust("房东知情声明 · 平台已审核")).toEqual({ reviewed: true, landlordAware: true });
    expect(listingTrust("用户声明房东知情 · 待平台审核")).toEqual({ reviewed: false, landlordAware: true });
    expect(listingTrust("")).toEqual({ reviewed: false, landlordAware: false });
  });

  it("never claims a lease was verified and tells renters to ask for it", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
    const html = renderToStaticMarkup(<SavedListingsProvider><ListingDetailExperience listing={{ ...listing, trust: "房东知情声明 · 平台已审核" }} /></SavedListingsProvider>);
    expect(html).toContain("平台已审核");
    expect(html).toContain("房东知情：转租人声明");
    expect(html).toContain("请对方出示租约");
    expect(html).not.toContain("租约已核验");
    expect(html).toContain("联系转租人");
  });
});

describe("dates the renter chose", () => {
  it("takes only requested dates", () => {
    expect(requestedListingStay()).toEqual({ moveIn: "", moveOut: "" });
    expect(requestedListingStay({ moveIn: "2026-10-01", moveOut: "nope" })).toEqual({ moveIn: "2026-10-01", moveOut: "" });
  });

  it("moves to the date field from the decision block instead of offering a dead button", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
    render(<SavedListingsProvider><ListingDetailExperience listing={listing} /></SavedListingsProvider>);
    const pick = screen.getByRole("button", { name: "选择日期" });
    expect((pick as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(pick);
    expect(document.activeElement?.id).toBe("booking-move-in");
  });

  it("does not repeat the dates as a removable chip on search", () => {
    render(<SavedListingsProvider><SearchExperience listings={createPreviewListings().slice(0, 3)} initialQuery="" initialMoveIn="2026-11-01" initialMoveOut="2027-01-15" /></SavedListingsProvider>);
    expect(screen.queryByRole("button", { name: /^移除 11月1日/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /11月1日 – 2027年1月15日/ }).length).toBe(1);
  });
});

describe("application", () => {
  it("shows the same dates and total as the listing", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-05T18:00:00Z"));
    const html = renderToStaticMarkup(<ApplicationFormExperience listing={listing} initialStay={{ moveIn: "2026-10-01", moveOut: "2026-12-01" }} />);
    expect(html).toContain("10月1日 – 12月1日");
    expect(html).toContain("2 个月");
    expect(html).not.toContain("2026-10-01 至");
  });

  it("puts a field's error under that field and marks it invalid", () => {
    render(<ApplicationFormExperience listing={listing} />);
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    const name = screen.getByPlaceholderText("你的姓名");
    expect(name.getAttribute("aria-invalid")).toBe("true");
    const message = document.getElementById(name.getAttribute("aria-describedby") ?? "");
    expect(message?.textContent).toBe("请填写姓名。");
    expect(screen.queryByText("查看我的申请")).toBeNull();
  });
});
