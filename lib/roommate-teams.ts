import { apiGet, apiPost } from "./api";

export type ApiRoommateTeamMember = {
  id: string;
  userId: string;
  snapshot: Record<string, unknown>;
  active: boolean;
  joinedAt?: string;
  leftAt?: string | null;
};

export type ApiRoommateTeam = {
  id: string;
  status: "ACTIVE" | "DISSOLVED";
  dealRoomId: string | null;
  confirmedAt: string;
  dissolvedAt: string | null;
  dissolvedById: string | null;
  dissolveReason: string | null;
  members: ApiRoommateTeamMember[];
};

export type ApiRoommateTeamInvite = {
  id: string;
  matchId: string;
  inviterId: string;
  inviteeId: string;
  teamId: string | null;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  expiresAt: string;
  respondedAt: string | null;
};

export type RoommateTeamAction =
  | { kind: "unavailable"; reason: string }
  | { kind: "invite" }
  | { kind: "outgoing"; invite: ApiRoommateTeamInvite }
  | { kind: "incoming"; invite: ApiRoommateTeamInvite }
  | { kind: "active"; team: ApiRoommateTeam };

export function deriveRoommateTeamAction(input: {
  viewerId: string;
  targetUserId: string;
  hasReciprocalMatch: boolean;
  team: ApiRoommateTeam | null;
  invites: ApiRoommateTeamInvite[];
}): RoommateTeamAction {
  if (
    input.team?.status === "ACTIVE" &&
    input.team.members.some((member) => member.active && member.userId === input.viewerId) &&
    input.team.members.some((member) => member.active && member.userId === input.targetUserId)
  ) {
    return { kind: "active", team: input.team };
  }

  const pending = input.invites.find(
    (invite) =>
      invite.status === "PENDING" &&
      ((invite.inviterId === input.viewerId && invite.inviteeId === input.targetUserId) ||
        (invite.inviterId === input.targetUserId && invite.inviteeId === input.viewerId))
  );
  if (pending?.inviterId === input.viewerId) return { kind: "outgoing", invite: pending };
  if (pending?.inviteeId === input.viewerId) return { kind: "incoming", invite: pending };

  if (!input.hasReciprocalMatch) {
    return { kind: "unavailable", reason: "双方互相喜欢后可邀请组队" };
  }

  return { kind: "invite" };
}

export async function getRoommateTeamState(token: string) {
  const [team, invites] = await Promise.all([
    apiGet<ApiRoommateTeam | null>("/roommate-teams/current", token),
    apiGet<ApiRoommateTeamInvite[]>("/roommate-teams/invites", token)
  ]);
  return { team, invites };
}

export function createRoommateTeamInvite(token: string, roommateProfileId: string) {
  return apiPost<ApiRoommateTeamInvite>("/roommate-teams/invites", { roommateProfileId }, token);
}

export function acceptRoommateTeamInvite(token: string, inviteId: string) {
  return apiPost<ApiRoommateTeam>(`/roommate-teams/invites/${encodeURIComponent(inviteId)}/accept`, {}, token);
}

export function declineRoommateTeamInvite(token: string, inviteId: string) {
  return apiPost<ApiRoommateTeamInvite>(`/roommate-teams/invites/${encodeURIComponent(inviteId)}/decline`, {}, token);
}

export function cancelRoommateTeamInvite(token: string, inviteId: string) {
  return apiPost<ApiRoommateTeamInvite>(`/roommate-teams/invites/${encodeURIComponent(inviteId)}/cancel`, {}, token);
}

export function leaveRoommateTeam(token: string) {
  return apiPost<ApiRoommateTeam>("/roommate-teams/current/leave", {}, token);
}
