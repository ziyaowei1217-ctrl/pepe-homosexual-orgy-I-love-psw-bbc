import { describe, expect, it } from "vitest";

import { deriveRoommateTeamAction, type ApiRoommateTeam, type ApiRoommateTeamInvite } from "../lib/roommate-teams";

const activeTeam: ApiRoommateTeam = {
  id: "team-1",
  status: "ACTIVE",
  dealRoomId: "deal-room-1",
  confirmedAt: "2026-08-14T00:00:00.000Z",
  dissolvedAt: null,
  dissolvedById: null,
  dissolveReason: null,
  members: [
    { id: "member-a", userId: "user-a", snapshot: { name: "Maya" }, active: true },
    { id: "member-b", userId: "user-b", snapshot: { name: "Mia" }, active: true }
  ]
};

describe("deriveRoommateTeamAction", () => {
  it("prioritizes an active team over stale pending invitations", () => {
    expect(
      deriveRoommateTeamAction({
        viewerId: "user-a",
        targetUserId: "user-b",
        hasReciprocalMatch: true,
        team: activeTeam,
        invites: [pendingInvite({ inviterId: "user-a", inviteeId: "user-b" })]
      })
    ).toEqual({ kind: "active", team: activeTeam });
  });

  it("derives outgoing and incoming pending states by persisted actor ids", () => {
    const outgoing = pendingInvite({ id: "invite-out", inviterId: "user-a", inviteeId: "user-b" });
    const incoming = pendingInvite({ id: "invite-in", inviterId: "user-b", inviteeId: "user-a" });

    expect(baseAction([outgoing])).toEqual({ kind: "outgoing", invite: outgoing });
    expect(baseAction([incoming])).toEqual({ kind: "incoming", invite: incoming });
  });

  it("offers an invitation only for a reciprocal match", () => {
    expect(baseAction([])).toEqual({ kind: "invite" });
    expect(
      deriveRoommateTeamAction({
        viewerId: "user-a",
        targetUserId: "user-b",
        hasReciprocalMatch: false,
        team: null,
        invites: []
      })
    ).toEqual({ kind: "unavailable", reason: "双方互相喜欢后可邀请组队" });
  });

  it("ignores terminal and unrelated invitations", () => {
    expect(
      baseAction([
        pendingInvite({ status: "DECLINED" }),
        pendingInvite({ inviterId: "user-a", inviteeId: "user-c" })
      ])
    ).toEqual({ kind: "invite" });
  });
});

function baseAction(invites: ApiRoommateTeamInvite[]) {
  return deriveRoommateTeamAction({
    viewerId: "user-a",
    targetUserId: "user-b",
    hasReciprocalMatch: true,
    team: null,
    invites
  });
}

function pendingInvite(overrides: Partial<ApiRoommateTeamInvite> = {}): ApiRoommateTeamInvite {
  return {
    id: "invite-1",
    matchId: "match-a-b",
    inviterId: "user-a",
    inviteeId: "user-b",
    teamId: null,
    status: "PENDING",
    expiresAt: "2026-08-21T00:00:00.000Z",
    respondedAt: null,
    ...overrides
  };
}
