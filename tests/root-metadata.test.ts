import { describe, expect, it, vi } from "vitest";

// next/font/local is a Next.js compile-time transform; outside the Next compiler it only needs to return a class name.
vi.mock("next/font/local", () => ({ default: () => ({ className: "font", variable: "font-variable" }) }));

import { metadata } from "../app/layout";

describe("root metadata", () => {
  it("describes nationwide rental market coverage", () => {
    expect((metadata.title as { default: string }).default).toBe(
      "psw｜全美学生与职场租房及室友匹配"
    );
  });
});
