import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("responsive grid system", () => {
  it("defines shared shell, grid, section, panel, and card-grid utilities", () => {
    const css = readFileSync("app/globals.css", "utf8");

    for (const selector of [".app-shell", ".app-grid", ".app-section", ".app-panel", ".app-card-grid"]) {
      expect(css).toContain(selector);
    }
    expect(css).toContain("max-w-[1440px]");
    expect(css).toContain("grid-cols-4");
    expect(css).toContain("md:grid-cols-8");
    expect(css).toContain("xl:grid-cols-12");
  });

  it("uses the shared shell throughout the application", () => {
    const source = readFileSync("components/sublet-app.tsx", "utf8");
    expect((source.match(/app-shell/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect(source).toContain("xl:col-span-7");
    expect(source).toContain("xl:col-span-5");
    expect(source).toContain("xl:col-span-8");
    expect(source).toContain("xl:col-span-4");
  });

  it("keeps listing cards on the shared card grid", () => {
    const source = readFileSync("components/sublet-app.tsx", "utf8");
    expect(source).toContain("app-card-grid");
    expect(source).toContain("aspect-[4/3]");
  });

  it("defines the agreed workspace column templates", () => {
    const source = readFileSync("components/sublet-app.tsx", "utf8");
    for (const contract of [
      "xl:col-span-3",
      "xl:col-span-9",
      "lg:col-span-4",
      "xl:col-span-8",
      "xl:col-span-4"
    ]) {
      expect(source).toContain(contract);
    }
  });

  it("uses quieter shared card and control radii", () => {
    const card = readFileSync("components/ui/card.tsx", "utf8");
    const button = readFileSync("components/ui/button.tsx", "utf8");
    expect(card).toContain("rounded-[20px]");
    expect(button).toContain("rounded-[14px]");
  });
});
