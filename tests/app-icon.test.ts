import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("app icon", () => {
  it("provides a Next app-router icon asset for browser tabs", () => {
    const icon = readFileSync("app/icon.svg", "utf8");

    expect(icon).toContain("<svg");
    expect(icon).toContain("Sublet Pipeline");
  });
});
