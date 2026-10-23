import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRoommateBudget, formatStay, roommateLabel, undoRoommateAction } from "../lib/roommate-matching";

afterEach(() => vi.unstubAllGlobals());

describe("roommate matching helpers", () => {
  it("formats stays and budgets for cards", () => {
    expect(formatStay("2027-01-04", "2027-06-12")).toBe("1/4 – 6/12");
    expect(formatStay("2026-12-15", "2027-05-31")).toBe("12/15 – 2027/5/31");
    expect(formatStay("2027-01-04", null)).toBe("1/4 起");
    expect(formatStay(null, "2027-06-12")).toBeNull();
    expect(formatRoommateBudget(1200, 1600)).toBe("$1,200–1,600/月");
    expect(formatRoommateBudget(1200, null)).toBe("$1,200 起/月");
    expect(formatRoommateBudget(null, 1600)).toBe("最高 $1,600/月");
    expect(formatRoommateBudget(null, null)).toBeNull();
    expect(formatRoommateBudget(0, null)).toBeNull();
    expect(formatRoommateBudget(0, 1500)).toBe("$0–1,500/月");
  });

  it("labels only known codes", () => {
    expect(roommateLabel("sleepSchedule", "night_owl")).toBe("夜猫子");
    expect(roommateLabel("sleepSchedule", "早睡")).toBeNull();
    expect(roommateLabel("pets", "toString")).toBeNull();
  });

  it("explains a refused undo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "已经配对，不能撤回" }, { status: 409 })));

    await expect(undoRoommateAction("token")).rejects.toThrow("只能撤回 10 分钟内、还没配对的操作。");
  });
});
