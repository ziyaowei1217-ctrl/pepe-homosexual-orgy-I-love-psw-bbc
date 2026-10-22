// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { HomeExperience } from "../components/marketplace/home-experience";
import { SavedListingsProvider } from "../components/marketplace/saved-listings-provider";
import { createPreviewListings } from "../lib/preview-data";

// The preview catalog has fixed dates; pin today so its listings stay bookable.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-22T19:00:00Z"));
});
afterAll(() => vi.useRealTimers());

describe("marketplace home", () => {
  it("starts a focused renter search and links recommendations to real detail routes", () => {
    const html = renderToStaticMarkup(
      <SavedListingsProvider><HomeExperience listings={createPreviewListings()} /></SavedListingsProvider>
    );

    expect(html).toContain("留学生之间的转租。选好日期，总价一次算清。");
    expect(html).not.toContain("比原价低");
    expect(html).toContain('action="/search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('href="/search?q=Boston"');
    expect(html).toContain('href="/search?q=New%20York"');
    expect(html).toContain('href="/search?q=Seattle"');
    expect(html).toContain('name="moveIn"');
    expect(html).toContain('name="moveOut"');
    expect(html).toContain("精选房源");
    expect(html).toContain('href="/listing/preview-01"');
    expect(html).not.toContain("管理员工具");
  });
});
