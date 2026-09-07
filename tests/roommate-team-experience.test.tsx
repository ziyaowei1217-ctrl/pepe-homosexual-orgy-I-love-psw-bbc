// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RoommateTeamExperience } from "../components/marketplace/roommate-team-experience";
import { writeStoredAuthSession } from "../lib/auth-session";
import type { ApiRoommateTeam } from "../lib/roommate-teams";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps the team intact when the user dismisses the leave confirmation", async () => {
  writeStoredAuthSession("team-token");
  vi.spyOn(window, "confirm").mockReturnValue(false);
  let leaveRequests = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "user-a", email: "a@example.test", role: "USER" });
    if (url.endsWith("/roommate-teams/current/leave") && init?.method === "POST") { leaveRequests += 1; return Response.json({}); }
    if (url.endsWith("/roommate-teams/current")) return Response.json(team("team-a", "user-b"));
    if (url.endsWith("/roommate-teams/invites")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
  render(<RoommateTeamExperience />);
  const leave = await screen.findByRole("button", { name: "退出小组" });
  await act(async () => { fireEvent.click(leave); });
  expect(leaveRequests).toBe(0);
  expect(screen.getByRole("button", { name: "退出小组" })).toBeDefined();
});

it("waits for the viewer identity before offering actions on an outgoing invitation", async () => {
  writeStoredAuthSession("team-token");
  let identify!: (response: Response) => void;
  const identity = new Promise<Response>((resolve) => { identify = resolve; });
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return identity;
    if (url.endsWith("/roommate-teams/current")) return Response.json(null);
    if (url.endsWith("/roommate-teams/invites")) return Response.json([{
      id: "invite-a", matchId: "match-a", inviterId: "user-a", inviteeId: "user-b", teamId: null,
      status: "PENDING", expiresAt: "2099-01-01T00:00:00Z", respondedAt: null
    }]);
    return Response.json({}, { status: 404 });
  }));
  render(<RoommateTeamExperience />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByRole("button", { name: "接受" })).toBeNull();
  expect(screen.getByRole("status")).toBeDefined();
  await act(async () => { identify(Response.json({ id: "user-a", email: "a@example.test", role: "USER" })); });
  expect(await screen.findByRole("button", { name: "取消" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "拒绝" })).toBeNull();
});

it("recovers a failed team load without falsely reporting that there are no teams", async () => {
  writeStoredAuthSession("team-token");
  let unavailable = true;
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "user-a", email: "a@example.test", role: "USER" });
    if (url.endsWith("/roommate-teams/current")) return unavailable ? Response.json({}, { status: 503 }) : Response.json(team("team-a", "user-b"));
    if (url.endsWith("/roommate-teams/invites")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));
  render(<RoommateTeamExperience />);
  await screen.findByRole("alert");
  expect(screen.queryByText(/暂无小组或待处理邀请/)).toBeNull();
  unavailable = false;
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByRole("button", { name: "退出小组" })).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("sends the displayed team ID when another tab replaces the current team under the same session", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  writeStoredAuthSession("same-session");
  const first = team("team-a", "user-b");
  let current = first;
  const commands: unknown[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/auth/me")) return Response.json({ id: "user-a", email: "a@example.test" });
    if (url.endsWith("/roommate-teams/current/leave")) {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ message: "组队状态已更新，请刷新后重试" }, { status: 409 });
    }
    if (url.endsWith("/roommate-teams/current")) return Response.json(current);
    if (url.endsWith("/roommate-teams/invites")) return Response.json([]);
    return Response.json({}, { status: 404 });
  }));

  render(<RoommateTeamExperience />);
  const leave = await screen.findByRole("button", { name: "退出小组" });
  current = team("team-b", "user-c");
  fireEvent.click(leave);

  await waitFor(() => expect(commands).toEqual([{ teamId: "team-a" }]));
  expect((await screen.findByRole("alert")).textContent).toBeTruthy();
});

function team(id: string, peer: string): ApiRoommateTeam {
  return {
    id, status: "ACTIVE", dealRoomId: `room-${id}`, confirmedAt: "2026-09-06T00:00:00.000Z",
    dissolvedAt: null, dissolvedById: null, dissolveReason: null,
    members: [
      { id: `${id}-a`, userId: "user-a", snapshot: {}, active: true },
      { id: `${id}-peer`, userId: peer, snapshot: {}, active: true }
    ]
  };
}
