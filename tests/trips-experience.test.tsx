// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TripsExperience } from "../components/marketplace/trips-experience";

describe("trips experience", () => {
  it("shows accepted stays as a clear contract-to-move-in timeline", () => {
    const html = renderToStaticMarkup(<TripsExperience />);

    expect(html).toContain("我的租住");
    expect(html).toContain("申请已接受");
    expect(html).toContain("签约");
    expect(html).toContain("付款");
    expect(html).toContain("入住");
    expect(html).toContain('href="/applications"');
    expect(html).not.toContain("房源筛选");
  });
});
