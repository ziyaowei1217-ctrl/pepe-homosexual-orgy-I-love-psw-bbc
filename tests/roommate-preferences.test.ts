import { describe, expect, it } from "vitest";

import {
  buildRoommatePreferenceFit,
  rankRoommatesByPreference,
  type PreferenceRoommateProfile,
  type RoommatePreference
} from "../lib/roommate-preferences";

const preference: RoommatePreference = {
  gender: "Women",
  budgetMin: 1400,
  budgetMax: 1800,
  schools: ["UCLA"],
  hobbies: ["早睡", "健身"]
};

const profiles: PreferenceRoommateProfile[] = [
  {
    name: "Mia Chen",
    role: "UCLA MSBA · 秋季入学",
    match: 92,
    budget: "$1,650/月",
    gender: "Woman",
    tags: ["早睡", "少做饭", "无宠物", "安静"]
  },
  {
    name: "Ryan Wu",
    role: "DTLA Finance Analyst",
    match: 94,
    budget: "$1,900/月",
    gender: "Man",
    tags: ["早起", "预算稳定", "门卫优先"]
  },
  {
    name: "Olivia Park",
    role: "UCLA Public Health",
    match: 88,
    budget: "$1,740/月",
    gender: "Woman",
    tags: ["早睡", "健身", "无宠物", "学习友好"]
  }
];

describe("roommate preferences", () => {
  it("ranks roommates by gender comfort, budget, school, and hobbies without hiding candidates", () => {
    const ranked = rankRoommatesByPreference(profiles, preference);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].name).toBe("Olivia Park");
    expect(ranked[0].preferenceFit.reasons).toContain("UCLA track");
    expect(ranked[0].preferenceFit.reasons).toContain("2 shared hobbies");
    expect(ranked[0].preferenceFit.score).toBeGreaterThan(ranked[2].preferenceFit.score);
    expect(ranked[2].name).toBe("Ryan Wu");
    expect(ranked[2].preferenceFit.gaps).toContain("Budget outside range");
  });

  it("treats open gender preference as neutral while still explaining budget and school fit", () => {
    const openPreference: RoommatePreference = {
      ...preference,
      gender: "Open",
      schools: ["USC"],
      hobbies: ["会做饭"]
    };
    const ava: PreferenceRoommateProfile = {
      name: "Ava Zhang",
      role: "USC Viterbi · CS",
      match: 90,
      budget: "$1,520/月",
      gender: "Woman",
      tags: ["会做饭", "猫友好", "不抽烟", "稳定"]
    };

    const fit = buildRoommatePreferenceFit(ava, openPreference);

    expect(fit.score).toBeGreaterThanOrEqual(90);
    expect(fit.reasons).toContain("USC track");
    expect(fit.reasons).toContain("1 shared hobby");
    expect(fit.reasons).toContain("Open shared-living preference");
    expect(fit.gaps).not.toContain("Shared-living preference differs");
  });
});
