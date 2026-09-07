import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const { buildShowcase } = require("../tools/product-showcase-builder.js") as {
  buildShowcase(input: {
    outputDir: string;
    entries: Array<{
      id: string;
      kind: "page" | "panel";
      category: string;
      title: string;
      description: string;
      image: string;
    }>;
  }): { pageCount: number; panelCount: number; imageCount: number };
};

describe("product showcase builder", () => {
  it("builds a browsable index from existing page and panel screenshots", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "sublet-showcase-"));
    mkdirSync(join(outputDir, "screenshots"));
    writeFileSync(join(outputDir, "screenshots", "home.png"), "home");
    writeFileSync(join(outputDir, "screenshots", "filters.png"), "filters");

    const result = buildShowcase({
      outputDir,
      entries: [
        {
          id: "page-home",
          kind: "page",
          category: "公共界面",
          title: "找房首页",
          description: "地图和房源目录",
          image: "screenshots/home.png"
        },
        {
          id: "panel-filters",
          kind: "panel",
          category: "租客",
          title: "搜索筛选",
          description: "日期、价格与设施",
          image: "screenshots/filters.png"
        }
      ]
    });

    const html = readFileSync(join(outputDir, "index.html"), "utf8");
    expect(result).toEqual({ pageCount: 1, panelCount: 1, imageCount: 2 });
    expect(html).toContain("Sublet Pipeline 产品展示");
    expect(html).toContain("data-kind=\"page\"");
    expect(html).toContain("screenshots/filters.png");
    expect(html).toContain("搜索筛选");
  });

  it("refuses to publish a showcase with a missing screenshot", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "sublet-showcase-"));

    expect(() =>
      buildShowcase({
        outputDir,
        entries: [
          {
            id: "page-home",
            kind: "page",
            category: "公共界面",
            title: "找房首页",
            description: "地图和房源目录",
            image: "screenshots/missing.png"
          }
        ]
      })
    ).toThrow("Missing screenshot: screenshots/missing.png");
  });
});
