import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("editorial grid redesign", () => {
  it("defines the approved editorial layout utilities", () => {
    const css = readFileSync("app/globals.css", "utf8");

    for (const selector of [
      ".editorial-kicker",
      ".editorial-title",
      ".editorial-toolbar",
      ".editorial-context-strip",
      ".editorial-field",
      ".editorial-panel"
    ]) {
      expect(css).toContain(selector);
    }
    expect(css).not.toContain("background-size: 64px 64px");
  });

  it("uses the neutral editorial primitive treatment", () => {
    const button = readFileSync("components/ui/button.tsx", "utf8");
    const card = readFileSync("components/ui/card.tsx", "utf8");
    const input = readFileSync("components/ui/input.tsx", "utf8");

    expect(button).toContain("rounded-[12px]");
    expect(button).toContain("bg-primary text-primary-foreground");
    expect(card).toContain("rounded-[18px]");
    expect(card).toContain("shadow-card");
    expect(input).toContain("rounded-[12px]");
    expect(input).toContain("bg-card");
  });

  it("applies the editorial language to the global shell and Stay", () => {
    const source = readFileSync("components/sublet-app.tsx", "utf8");

    expect(source).toContain("01 / Stay");
    expect(source).toContain("02 / Discover");
    expect(source).toContain("editorial-context-strip");
    expect(source).toContain("xl:col-span-7");
    expect(source).toContain("xl:col-span-5");
    expect(source).toContain("rounded-[18px]");
  });

  it("uses aligned editorial listing cards", () => {
    const source = readFileSync("components/sublet-app.tsx", "utf8");

    expect(source).toContain("aspect-[16/11]");
    expect(source).toContain("border-t border-border");
    expect(source).toContain("mt-auto");
  });
});
