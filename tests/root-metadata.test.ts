import { describe, expect, it, vi } from "vitest";

// next/font/local is a Next.js compile-time transform; outside the Next compiler it only needs to return a class name.
vi.mock("next/font/local", () => ({ default: () => ({ className: "font", variable: "font-variable" }) }));

import { metadata } from "../app/layout";

describe("root metadata", () => {
  it("names the brand's positioning: sublets between international students", () => {
    expect((metadata.title as { default: string }).default).toBe("psw｜留学生之间的转租");
    expect(metadata.description).toContain("这段日期的总价");
  });
});
