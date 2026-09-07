import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

type ShowcaseEntry = {
  id: string;
  kind: "page" | "panel";
  category: string;
  title: string;
  description: string;
  image: string;
};

const showcaseDir = join(process.cwd(), "output", "product-showcase");

describe("product showcase manifest", () => {
  it("publishes every captured PNG exactly once with complete display metadata", () => {
    const manifestPath = join(showcaseDir, "showcase.json");
    expect(existsSync(manifestPath)).toBe(true);

    const entries = JSON.parse(readFileSync(manifestPath, "utf8")) as ShowcaseEntry[];
    const capturedPngs = readdirSync(join(showcaseDir, "screenshots"))
      .filter((file) => file.endsWith(".png"))
      .sort();
    const publishedPngs = entries.map((entry) => basename(entry.image)).sort();

    expect(publishedPngs).toEqual(capturedPngs);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    expect(entries.some((entry) => entry.kind === "page")).toBe(true);
    expect(entries.some((entry) => entry.kind === "panel")).toBe(true);

    for (const entry of entries) {
      expect(entry.id.trim()).not.toBe("");
      expect(entry.category.trim()).not.toBe("");
      expect(entry.title.trim()).not.toBe("");
      expect(entry.description.trim()).not.toBe("");
      expect(existsSync(join(showcaseDir, entry.image))).toBe(true);
    }
  });
});
