import { describe, expect, it } from "vitest";

import { metadata } from "../app/layout";

describe("root metadata", () => {
  it("describes international-student subleasing", () => {
    expect((metadata.title as { default: string }).default).toBe(
      "psw｜留学生转租、接租与室友"
    );
  });
});
