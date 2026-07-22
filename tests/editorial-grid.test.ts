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
});
