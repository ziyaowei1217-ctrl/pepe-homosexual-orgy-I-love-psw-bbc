import { describe, expect, it } from "vitest";

import {
  applicationScopeOptions,
  getRentalApplicationStatusCopy,
  validateRentalApplicationDraft
} from "../lib/rental-applications";

const listing = { availableFrom: "2026-09-01", availableTo: "2027-01-01" };
const draft = {
  scope: "SOLO" as const,
  teamId: undefined,
  moveIn: "2026-09-01",
  moveOut: "2027-01-01",
  schoolOrOccupation: "UCLA student",
  incomeBand: "TWO_TO_THREE_X" as const,
  guarantorStatus: "AVAILABLE" as const,
  note: "Quiet"
};

describe("rental application client contract", () => {
  it("accepts exact listing boundaries and rejects partial, reversed, or uncovered dates", () => {
    expect(validateRentalApplicationDraft(draft, listing)).toEqual([]);
    expect(validateRentalApplicationDraft({ ...draft, moveIn: "" }, listing)).toContain("请选择入住日期。");
    expect(validateRentalApplicationDraft({ ...draft, moveOut: "2026-08-31" }, listing)).toContain("退租日期必须晚于入住日期。");
    expect(validateRentalApplicationDraft({ ...draft, moveIn: "2026-08-31" }, listing)).toContain("申请日期必须完整落在房源可租日期内。");
  });

  it("offers team scope only for an active two-member team", () => {
    expect(applicationScopeOptions(null)).toEqual([{ value: "SOLO", label: "个人申请" }]);
    expect(applicationScopeOptions({
      id: "team-1",
      status: "ACTIVE",
      members: [{ active: true }, { active: true }]
    } as never)).toEqual([
      { value: "SOLO", label: "个人申请" },
      { value: "TEAM", label: "两人小组申请" }
    ]);
  });

  it("maps every persisted status to renter-facing copy", () => {
    expect(getRentalApplicationStatusCopy("DRAFT").label).toBe("草稿");
    expect(getRentalApplicationStatusCopy("SUBMITTED").label).toBe("等待房东处理");
    expect(getRentalApplicationStatusCopy("ACCEPTED").label).toBe("申请已接受");
    expect(getRentalApplicationStatusCopy("COMPLETED").label).toBe("入住已确认");
  });
});
