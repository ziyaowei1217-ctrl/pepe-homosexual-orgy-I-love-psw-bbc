import { describe, expect, it } from "vitest";

import { buildProfileUpdateInput } from "../lib/profile-input";

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
});
