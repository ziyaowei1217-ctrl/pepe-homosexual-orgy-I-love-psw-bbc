import { describe, expect, it } from "vitest";

import {
  buildOnboardingProfileInput,
  buildProfileUpdateInput
} from "../lib/profile-input";

describe("profile update input", () => {
  it("uses null for explicitly cleared fields and omits fields absent from the patch", () => {
    expect(
      buildProfileUpdateInput({
        displayName: "  测试房东  ",
        school: " UCLA ",
        city: " LA ",
        role: "lister",
        instagram: " ",
        wechat: "",
        bio: "  "
      })
    ).toEqual({
      displayName: "测试房东",
      school: "UCLA",
      city: "LA",
      role: "lister",
      instagram: null,
      wechat: null,
      bio: null
    });
  });

  it("preserves explicit clearing when a caller normalizes an already normalized patch", () => {
    expect(buildProfileUpdateInput({ bio: null, avatarUrl: null })).toEqual({ bio: null, avatarUrl: null });
  });

  it("trims the four required onboarding fields", () => {
    expect(
      buildOnboardingProfileInput({
        displayName: "  Maya Chen ",
        school: " UCLA ",
        city: " Los Angeles ",
        role: "lister"
      })
    ).toEqual({
      displayName: "Maya Chen",
      school: "UCLA",
      city: "Los Angeles",
      role: "lister"
    });
  });
});
