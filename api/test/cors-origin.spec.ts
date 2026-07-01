import { describe, expect, it } from "vitest";

import { getCorsOrigins } from "../src/config/cors";

describe("CORS origin config", () => {
  it("allows common local frontend fallback ports by default", () => {
    expect(getCorsOrigins()).toEqual(["http://localhost:3000", "http://localhost:3001"]);
  });

  it("parses explicit comma-separated origins", () => {
    expect(getCorsOrigins("https://app.example.com, http://localhost:3002 ")).toEqual([
      "https://app.example.com",
      "http://localhost:3002"
    ]);
  });
});
