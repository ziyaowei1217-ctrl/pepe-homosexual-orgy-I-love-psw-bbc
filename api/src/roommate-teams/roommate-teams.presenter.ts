type TeamMemberRecord = {
  id: string;
  userId: string;
  snapshot: unknown;
  joinedAt: Date;
  leftAt: Date | null;
  active: boolean;
};

type TeamRecord = {
  id: string;
  status: string;
  dealRoomId: string | null;
  confirmedAt: Date;
  dissolvedAt: Date | null;
  dissolvedById: string | null;
  dissolveReason: string | null;
  members: TeamMemberRecord[];
  createdAt: Date;
  updatedAt: Date;
};

type InviteRecord = {
  id: string;
  matchId: string;
  inviterId: string;
  inviteeId: string;
  teamId: string | null;
  status: string;
  expiresAt: Date;
  respondedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function presentRoommateTeam(team: TeamRecord) {
  return {
    id: team.id,
    status: team.status,
    dealRoomId: team.dealRoomId,
    confirmedAt: team.confirmedAt,
    dissolvedAt: team.dissolvedAt,
    dissolvedById: team.dissolvedById,
    dissolveReason: team.dissolveReason,
    members: team.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      snapshot: member.snapshot,
      active: member.active,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt
    })),
    createdAt: team.createdAt,
    updatedAt: team.updatedAt
  };
}

export function presentRoommateTeamInvite(invite: InviteRecord) {
  return {
    id: invite.id,
    matchId: invite.matchId,
    inviterId: invite.inviterId,
    inviteeId: invite.inviteeId,
    teamId: invite.teamId,
    status: invite.status,
    expiresAt: invite.expiresAt,
    respondedAt: invite.respondedAt,
    createdAt: invite.createdAt,
    updatedAt: invite.updatedAt
  };
}
