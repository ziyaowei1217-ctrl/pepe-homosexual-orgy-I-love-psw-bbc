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




  it("uses the approved shared card and control radii", () => {
    const card = readFileSync("components/ui/card.tsx", "utf8");
    const button = readFileSync("components/ui/button.tsx", "utf8");
    expect(card).toContain("rounded-psw-xl");
    expect(button).toContain("rounded-full");
  });
});
