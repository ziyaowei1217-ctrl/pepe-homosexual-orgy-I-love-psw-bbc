import { describe, expect, it } from "vitest";

import { checkProductCapability } from "../lib/product-capabilities";

describe("product capabilities", () => {
  it("allows public browsing but sends guests to authentication for protected actions", () => {
    expect(checkProductCapability("browse-listings", { authenticated: false, apiOnline: true }).status).toBe("allowed");
    expect(checkProductCapability("favorite-listing", { authenticated: false, apiOnline: true }).status).toBe("requires-auth");
    expect(checkProductCapability("message-host", { authenticated: false, apiOnline: true }).status).toBe("requires-auth");
    expect(checkProductCapability("request-viewing", { authenticated: false, apiOnline: true }).status).toBe("requires-auth");
    expect(checkProductCapability("roommate-action", { authenticated: false, apiOnline: true }).status).toBe("requires-auth");
  });

  it("requires a lister role for publishing and does not claim backend authorization", () => {
    expect(
      checkProductCapability("publish-listing", {
        authenticated: true,
        apiOnline: true,
        profileRole: undefined
      }).status
    ).toBe("unavailable");
    expect(
      checkProductCapability("publish-listing", {
        authenticated: true,
        apiOnline: true,
        profileRole: "renter"
      }).status
    ).toBe("unavailable");
    expect(
      checkProductCapability("publish-listing", {
        authenticated: true,
        apiOnline: true,
        profileRole: "both"
      }).status
    ).toBe("allowed");
  });

  it("distinguishes offline APIs from capabilities that are not implemented", () => {
    expect(
      checkProductCapability("message-host", {
        authenticated: true,
        apiOnline: false,
        profileRole: "renter"
      }).status
    ).toBe("api-offline");
    expect(
      checkProductCapability("application", {
        authenticated: true,
        apiOnline: true,
        profileRole: "renter"
      }).status
    ).toBe("unavailable");
    expect(
      checkProductCapability("roommate-message", {
        authenticated: true,
        apiOnline: true,
        profileRole: "renter"
      }).status
    ).toBe("allowed");
    expect(
      checkProductCapability("roommate-message", {
        authenticated: false,
        apiOnline: true,
        profileRole: "renter"
      }).status
    ).toBe("requires-auth");
    expect(
      checkProductCapability("roommate-message", {
        authenticated: true,
        apiOnline: false,
        profileRole: "renter"
      }).status
    ).toBe("api-offline");
  });

  it("treats date filtering as an available API-backed capability", () => {
    expect(
      checkProductCapability("date-filter", {
        authenticated: false,
        apiOnline: true
      }).status
    ).toBe("allowed");
    expect(
      checkProductCapability("date-filter", {
        authenticated: false,
        apiOnline: false
      }).status
    ).toBe("api-offline");
  });
});
