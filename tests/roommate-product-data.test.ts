import { describe, expect, it } from "vitest";

import {
  getRoommateStateKey,
  getThreadParticipantNames,
  hasCompleteRoommateGenderData,
  selectSingleDealRoom
} from "../lib/roommate-product-data";

describe("roommate product data", () => {
  it("uses the stable API id instead of merging people who share a name", () => {
    expect(getRoommateStateKey({ id: "roommate-a", name: "Alex" })).toBe("roommate-a");
    expect(getRoommateStateKey({ id: "roommate-b", name: "Alex" })).toBe("roommate-b");
    expect(getRoommateStateKey({ name: "Alex" })).toBe("name:Alex");
  });

  it("only includes the signed-in user and explicitly selected group members", () => {
    expect(getThreadParticipantNames([])).toEqual(["我"]);
    expect(
      getThreadParticipantNames([
        { id: "roommate-a", name: "Mia" },
        { id: "roommate-b", name: "Mia" }
      ])
    ).toEqual(["Mia", "我"]);
  });

  it("does not guess an active room when more than one group exists", () => {
    expect(selectSingleDealRoom([{ id: "room-a" }])).toEqual({ id: "room-a" });
    expect(selectSingleDealRoom([{ id: "room-a" }, { id: "room-b" }])).toBeNull();
  });

  it("only enables gender filtering when every profile provides the field", () => {
    expect(hasCompleteRoommateGenderData([{ gender: "Woman" }, { gender: "Man" }])).toBe(true);
    expect(hasCompleteRoommateGenderData([{ gender: "Woman" }, {}])).toBe(false);
    expect(hasCompleteRoommateGenderData([])).toBe(false);
  });
});
