import { describe, expect, it } from "vitest";

import {
  buildOnboardingProfileInput,
  buildProfileUpdateInput
} from "../lib/profile-input";

describe("profile update input", () => {
  it("omits blank optional fields rejected by the backend DTO", () => {
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
      role: "lister"
    });
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
