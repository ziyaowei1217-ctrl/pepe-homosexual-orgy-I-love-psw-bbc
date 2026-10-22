// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoommateProfileEditor } from "../components/marketplace/roommate-profile-form";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { MyRoommateProfile } from "../lib/roommate-matching";

const existing: MyRoommateProfile = {
  id: "matching-1", cardId: "card-1", displayName: "Mia", age: 24, gender: "female", genderPreference: "female", school: "UCLA", city: "Los Angeles",
  budgetMin: 1200, budgetMax: 1600, moveInDate: "2027-01-04", moveOutDate: "2027-06-12", preferredNeighborhoods: ["Westwood", "Sawtelle"],
  roomType: "private_room", sleepSchedule: "early_bird", cleanliness: "tidy", guests: "rarely", smoking: "no", pets: "none", dealbreakers: ["smoking"],
  intro: "UCLA 研究生", lookingFor: null, status: "active"
};

beforeEach(() => writeStoredAuthSession("renter-token"));

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("roommate profile editor", () => {
  it("loads the saved profile and updates it in place", async () => {
    const writes = stubApi(existing);
    render(<RoommateProfileEditor />);

    fireEvent.change(await screen.findByLabelText("学校或公司"), { target: { value: "USC" } });
    fireEvent.click(within(screen.getByRole("group", { name: "宠物" })).getByRole("button", { name: "养宠物" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect((await screen.findByRole("status")).textContent).toBe("已保存去看推荐");
    expect(writes).toEqual([["PATCH", "/roommate-profiles/matching-1", {
      age: 24, gender: "female", genderPreference: "female", school: "USC", city: "Los Angeles", budgetMin: 1200, budgetMax: 1600,
      moveInDate: "2027-01-04", moveOutDate: "2027-06-12", preferredNeighborhoods: ["Westwood", "Sawtelle"], roomType: "private_room",
      sleepSchedule: "early_bird", cleanliness: "tidy", guests: "rarely", smoking: "no", pets: "has_pet", dealbreakers: ["smoking"], intro: "UCLA 研究生", lookingFor: null
    }]]);
  });

  it("creates the profile and saves a changed display name first", async () => {
    const writes = stubApi(null);
    render(<RoommateProfileEditor />);

    fireEvent.change(await screen.findByLabelText("称呼"), { target: { value: "Noah" } });
    fireEvent.change(screen.getByLabelText("年龄"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("想住的区域"), { target: { value: "Palms，Culver City、Palms" } });
    fireEvent.click(within(screen.getByRole("group", { name: "对方有这些情况时，不会互相推荐" })).getByRole("button", { name: "宠物" }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await screen.findByRole("status");
    expect(writes.map(([method, path]) => `${method} ${path}`)).toEqual(["PATCH /profiles/me", "POST /roommate-profiles"]);
    expect(writes[0][2]).toEqual({ displayName: "Noah" });
    expect(writes[1][2]).toMatchObject({ age: 25, genderPreference: "any", preferredNeighborhoods: ["Palms", "Culver City"], dealbreakers: ["pets"], school: null });
  });

  it("explains invalid age, budget and dates without saving", async () => {
    const writes = stubApi(null);
    render(<RoommateProfileEditor />);

    fireEvent.change(await screen.findByLabelText("年龄"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("每月最低（美元）"), { target: { value: "1800" } });
    fireEvent.change(screen.getByLabelText("每月最高（美元）"), { target: { value: "1500" } });
    fireEvent.change(screen.getByLabelText("入住日期"), { target: { value: "2027-06-01" } });
    fireEvent.change(screen.getByLabelText("搬走日期"), { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([
      "年龄需要在 18 到 80 岁之间。", "搬走日期不能早于入住日期。", "每月最低预算不能高于最高预算。"
    ]);
    const description = (label: string) => document.getElementById(screen.getByLabelText(label).getAttribute("aria-describedby") ?? "")?.textContent;
    expect(description("年龄")).toBe("年龄需要在 18 到 80 岁之间。");
    expect(description("每月最高（美元）")).toBe("每月最低预算不能高于最高预算。");
    expect(writes).toEqual([]);
  });
});

/** Serves the two profile reads and records every write as [method, path, body]. */
function stubApi(profile: MyRoommateProfile | null) {
  const writes: Array<[string, string, unknown]> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input).replace(/^.*\/api\/v1/, "");
    const method = init.method ?? "GET";
    if (method !== "GET") writes.push([method, path, JSON.parse(String(init.body))]);
    if (path === "/roommate-profiles/me") return Response.json({ profile });
    if (path === "/profiles/me") return Response.json({ id: "profile-1", email: "a@example.com", displayName: profile?.displayName ?? null });
    if (path.startsWith("/roommate-profiles")) return Response.json({ id: profile?.id ?? "matching-new" });
    return new Response(null, { status: 404 });
  }));
  return writes;
}
