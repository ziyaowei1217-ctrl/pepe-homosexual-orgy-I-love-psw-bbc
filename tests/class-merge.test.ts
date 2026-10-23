import { expect, it } from "vitest";

import { cn } from "../lib/utils";

it("keeps a psw type size when a text colour follows it", () => {
  expect(cn("rounded-psw-sm text-m-footnote font-bold", "bg-warning-soft text-warning-text")).toBe("rounded-psw-sm text-m-footnote font-bold bg-warning-soft text-warning-text");
  expect(cn("text-d-price-large", "text-primary-text")).toBe("text-d-price-large text-primary-text");
});

it("still lets a later size or colour win over an earlier one", () => {
  expect(cn("text-sm", "text-m-footnote")).toBe("text-m-footnote");
  expect(cn("text-m-footnote sm:text-d-subhead", "text-d-title")).toBe("sm:text-d-subhead text-d-title");
  expect(cn("text-ink-secondary", "text-danger-text")).toBe("text-danger-text");
});
