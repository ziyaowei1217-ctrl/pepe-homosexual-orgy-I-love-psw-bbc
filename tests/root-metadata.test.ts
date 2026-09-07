import { describe, expect, it } from "vitest";

import { metadata } from "../app/layout";

describe("root metadata", () => {
  it("describes nationwide rental market coverage", () => {
    expect((metadata.title as { default: string }).default).toBe(
      "Sublet Pipeline｜全美学生与职场租房及室友匹配"
    );
  });
});
