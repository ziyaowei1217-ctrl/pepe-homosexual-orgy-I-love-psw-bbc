import { describe, expect, it } from "vitest";

import {
  buildRoommatePreferenceFit,
  filterRoommatesByPreference,
  getRoommateDeckCandidates,
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
  it("filters by gender, budget and school while hobbies only affect ranking", () => {
    const ranked = rankRoommatesByPreference(profiles, preference);
    const filtered = filterRoommatesByPreference(ranked, preference);

    expect(getRoommateDeckCandidates(filtered)).toEqual(filtered);
    expect(filtered.map((candidate) => candidate.name)).toEqual(["Olivia Park", "Mia Chen"]);
  });

  it("ranks roommates by gender comfort, budget, school, and hobbies without hiding candidates", () => {
    const ranked = rankRoommatesByPreference(profiles, preference);

    expect(ranked).toHaveLength(3);
    expect(ranked[0].name).toBe("Olivia Park");
    expect(ranked[0].preferenceFit.reasons).toContain("同校：UCLA");
    expect(ranked[0].preferenceFit.reasons).toContain("2 项共同爱好");
    expect(ranked[0].preferenceFit.score).toBeGreaterThan(ranked[2].preferenceFit.score);
    expect(ranked[2].name).toBe("Ryan Wu");
    expect(ranked[2].preferenceFit.gaps).toContain("预算不在范围内");
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
    expect(fit.reasons).toContain("同校：USC");
    expect(fit.reasons).toContain("1 项共同爱好");
    expect(fit.reasons).toContain("不限性别");
    expect(fit.gaps).not.toContain("性别偏好不同");
  });
});
