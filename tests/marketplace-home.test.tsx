// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HomeExperience } from "../components/marketplace/home-experience";
import { createPreviewListings } from "../lib/preview-data";

describe("marketplace home", () => {
  it("starts a focused renter search and links recommendations to real detail routes", () => {
    const html = renderToStaticMarkup(
      <HomeExperience listings={createPreviewListings().slice(0, 4)} />
    );

    expect(html).toContain("更轻松地找到全美主要城市的下一处住所");
    expect(html).toContain('action="/search"');
    expect(html).toContain('name="q"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('href="/search?q=Boston"');
    expect(html).toContain('href="/search?q=New%20York"');
    expect(html).toContain('href="/search?q=Seattle"');
    expect(html).toContain('name="moveIn"');
    expect(html).toContain('name="moveOut"');
    expect(html).toContain('href="/listing/preview-01"');
    expect(html).not.toContain("管理员工具");
  });
});
