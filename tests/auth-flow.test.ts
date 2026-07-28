import { describe, expect, it } from "vitest";

import {
  getMissingProfileFields,
  getPublishGate,
  getResendSeconds,
  isProfileComplete,
  isValidAuthEmail,
  normalizeAuthEmail,
  normalizeVerificationCode,
  shouldClearAuthSession,
  shouldOpenNewUserOnboarding
} from "../lib/auth-flow";
import { productErrorForStatus } from "../lib/product-errors";

describe("auth flow input", () => {
  it("normalizes email and accepts only a plausible complete address", () => {
    expect(normalizeAuthEmail(" Student@UCLA.edu ")).toBe("student@ucla.edu");
    expect(isValidAuthEmail("student@ucla.edu")).toBe(true);
    expect(isValidAuthEmail("student@ucla")).toBe(false);
  });

  it("keeps at most six verification-code digits", () => {
    expect(normalizeVerificationCode(" 12a34-567 ")).toBe("123456");
  });

  it("rounds resend time up and never returns a negative value", () => {
    expect(getResendSeconds(61_000, 1_500)).toBe(60);
    expect(getResendSeconds(1_000, 1_001)).toBe(0);
  });
});

describe("profile onboarding rules", () => {
  const completeProfile = {
    displayName: "Maya Chen",
    school: "UCLA",
    city: "Los Angeles",
    role: "lister" as const
  };

  it("reports the exact onboarding fields still missing", () => {
    expect(
      getMissingProfileFields({
        displayName: " ",
        school: "UCLA",
        city: null,
        role: "renter"
      })
    ).toEqual(["displayName", "city"]);
    expect(isProfileComplete(completeProfile)).toBe(true);
  });

  it("opens onboarding only for a new user with incomplete profile", () => {
    expect(
      shouldOpenNewUserOnboarding({
        isNewUser: true,
        profile: { ...completeProfile, displayName: null }
      })
    ).toBe(true);
    expect(
      shouldOpenNewUserOnboarding({
        isNewUser: false,
        profile: { ...completeProfile, displayName: null }
      })
    ).toBe(false);
  });

  it("gates publishing in auth, profile, and role order", () => {
    expect(getPublishGate({ authenticated: false, profile: null }).status).toBe("needs-auth");
    expect(
      getPublishGate({
        authenticated: true,
        profile: { ...completeProfile, school: null }
      }).status
    ).toBe("needs-profile");
    expect(
      getPublishGate({
        authenticated: true,
        profile: { ...completeProfile, role: "renter" }
      }).status
    ).toBe("needs-role");
    expect(
      getPublishGate({ authenticated: true, profile: completeProfile }).status
    ).toBe("allowed");
  });
});

it("clears a session only for authentication errors", () => {
  expect(shouldClearAuthSession(productErrorForStatus(401))).toBe(true);
  expect(shouldClearAuthSession(productErrorForStatus(503))).toBe(false);
});
