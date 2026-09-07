import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { RoommateTeamsService } from "../src/roommate-teams/roommate-teams.service";

describe("RoommateTeamsService", () => {
  it("creates one seven-day invitation only for an active reciprocal match", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const before = Date.now();

    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });

    expect(invite).toMatchObject({
      inviterId: "user-a",
      inviteeId: "user-b",
      matchId: "match-ab",
      status: "PENDING"
    });
    expect(new Date(invite.expiresAt).getTime()).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000);
    await expect(service.invite("user-a", { roommateProfileId: "profile-b" })).resolves.toMatchObject({ id: invite.id });

    prisma.roommateMatch.rows[0]!.status = "CLOSED";
    prisma.roommateTeamInvite.rows.length = 0;
    await expect(service.invite("user-a", { roommateProfileId: "profile-b" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("lets only the invitee accept and atomically creates two active memberships and a Deal Room", async () => {
    const prisma = createPrismaMock();
    const dealRooms = createDealRoomsStub();
    const service = new RoommateTeamsService(prisma as never, dealRooms as never);
    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });

    await expect(service.accept("user-a", invite.id)).rejects.toBeInstanceOf(NotFoundException);
    const team = await service.accept("user-b", invite.id);

    expect(team).toMatchObject({ status: "ACTIVE", dealRoomId: "deal-room-1" });
    expect(team.members.map((member: { userId: string }) => member.userId).sort()).toEqual(["user-a", "user-b"]);
    expect(dealRooms.calls).toEqual([{ ownerId: "user-a", teammateId: "user-b" }]);
    await expect(service.accept("user-b", invite.id)).resolves.toMatchObject({ id: team.id });
  });

  it("cancels every competing pending invitation involving either accepted member", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const acceptedInvite = await service.invite("user-a", { roommateProfileId: "profile-b" });
    const competingInvite = await service.invite("user-c", { roommateProfileId: "profile-b" });

    await service.accept("user-b", acceptedInvite.id);

    expect(prisma.roommateTeamInvite.rows.find((invite: { id: string }) => invite.id === competingInvite.id))
      .toMatchObject({ status: "CANCELLED", respondedAt: expect.any(Date) });
  });

  it("prevents either participant from entering a second active team", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    prisma.roommateTeam.rows.push(teamRecord({ id: "existing-team" }));
    prisma.roommateTeamMember.rows.push(memberRecord({ teamId: "existing-team", userId: "user-a" }));

    await expect(service.invite("user-a", { roommateProfileId: "profile-b" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("supports invite decline and inviter cancellation without exposing unrelated invites", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const declined = await service.invite("user-a", { roommateProfileId: "profile-b" });

    await expect(service.decline("user-a", declined.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.decline("user-b", declined.id)).resolves.toMatchObject({ status: "DECLINED" });

    const cancelled = await service.invite("user-a", { roommateProfileId: "profile-b" });
    await expect(service.cancel("user-b", cancelled.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancel("user-a", cancelled.id)).resolves.toMatchObject({ status: "CANCELLED" });
    await expect(service.cancel("user-c", cancelled.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("expires overdue invitations before returning them", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });
    prisma.roommateTeamInvite.rows[0]!.expiresAt = new Date(Date.now() - 1);

    await expect(service.listInvites("user-b")).resolves.toMatchObject([{ id: invite.id, status: "EXPIRED" }]);
    await expect(service.accept("user-b", invite.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it("dissolves the active team, deactivates both members, and archives its Deal Room", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });
    const team = await service.accept("user-b", invite.id);

    await expect(service.leave("user-a", team.id)).resolves.toMatchObject({
      id: team.id,
      status: "DISSOLVED",
      dissolvedById: "user-a"
    });
    expect(
      prisma.roommateTeamMember.rows.every(
        (member: Member) => member.active === false && member.leftAt instanceof Date
      )
    ).toBe(true);
    expect(prisma.dealRoom.rows[0]).toMatchObject({ id: "deal-room-1", status: "ARCHIVED" });
    await expect(service.current("user-a")).resolves.toBeNull();
  });

  it("rejects a stale team target without dissolving the current team", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });
    const team = await service.accept("user-b", invite.id);

    await expect(service.leave("user-a", "previous-team")).rejects.toBeInstanceOf(ConflictException);

    expect(await service.current("user-a")).toEqual(team);
    expect(prisma.dealRoom.rows[0]).toMatchObject({ status: "ACTIVE" });
  });

  it("withdraws only submitted team applications when the team dissolves", async () => {
    const prisma = createPrismaMock();
    const service = new RoommateTeamsService(prisma as never, createDealRoomsStub() as never);
    const invite = await service.invite("user-a", { roommateProfileId: "profile-b" });
    const team = await service.accept("user-b", invite.id);
    prisma.rentalApplication.rows.push(
      { id: "draft-application", teamId: team.id, status: "DRAFT", activeKey: "team:draft", withdrawnAt: null, decisionReason: null },
      { id: "submitted-application", teamId: team.id, status: "SUBMITTED", activeKey: "team:submitted", withdrawnAt: null, decisionReason: null },
      { id: "accepted-application", teamId: team.id, status: "ACCEPTED", activeKey: "team:accepted", withdrawnAt: null, decisionReason: null },
      { id: "other-team-application", teamId: "team-other", status: "SUBMITTED", activeKey: "team:other", withdrawnAt: null, decisionReason: null }
    );

    await service.leave("user-a", team.id);

    expect(prisma.rentalApplication.rows.find((record: { id: string }) => record.id === "submitted-application"))
      .toMatchObject({ status: "WITHDRAWN", activeKey: null, withdrawnAt: expect.any(Date), decisionReason: "TEAM_DISSOLVED" });
    expect(prisma.rentalApplication.rows.find((record: { id: string }) => record.id === "draft-application")?.status).toBe("DRAFT");
    expect(prisma.rentalApplication.rows.find((record: { id: string }) => record.id === "accepted-application")?.status).toBe("ACCEPTED");
    expect(prisma.rentalApplication.rows.find((record: { id: string }) => record.id === "other-team-application")?.status).toBe("SUBMITTED");
  });
});

type Profile = {
  id: string;
  ownerId: string;
  name: string;
  age: number;
  role: string;
  image: string;
  match: number;
  budget: string;
  commute: string;
  tags: string[];
};

type Team = ReturnType<typeof teamRecord>;
type Member = ReturnType<typeof memberRecord>;

function createPrismaMock() {
  const profiles: Profile[] = [
    profileRecord({ id: "profile-a", ownerId: "user-a", name: "A" }),
    profileRecord({ id: "profile-b", ownerId: "user-b", name: "B" }),
    profileRecord({ id: "profile-c", ownerId: "user-c", name: "C" })
  ];
  const matches = [
    { id: "match-ab", firstUserId: "user-a", secondUserId: "user-b", status: "ACTIVE" },
    { id: "match-bc", firstUserId: "user-b", secondUserId: "user-c", status: "ACTIVE" }
  ];
  const invites: Array<{
    id: string;
    matchId: string;
    inviterId: string;
    inviteeId: string;
    teamId: string | null;
    status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
    expiresAt: Date;
    respondedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const teams: Team[] = [];
  const members: Member[] = [];
  const dealRooms = [{ id: "deal-room-1", status: "ACTIVE" as const }];
  const rentalApplications: Array<{
    id: string;
    teamId: string;
    status: "DRAFT" | "SUBMITTED" | "ACCEPTED" | "WITHDRAWN";
    activeKey: string | null;
    withdrawnAt: Date | null;
    decisionReason: string | null;
  }> = [];

  const mock: any = {
    roommateProfile: {
      rows: profiles,
      findUnique: async ({ where }: { where: { id?: string; ownerId?: string } }) =>
        profiles.find((profile) =>
          where.id ? profile.id === where.id : profile.ownerId === where.ownerId
        ) ?? null,
      findMany: async ({ where }: { where: { ownerId: { in: string[] } } }) =>
        profiles.filter((profile) => where.ownerId.in.includes(profile.ownerId))
    },
    roommateMatch: {
      rows: matches,
      findUnique: async ({ where }: { where: { firstUserId_secondUserId: { firstUserId: string; secondUserId: string } } }) =>
        matches.find((match) =>
          match.firstUserId === where.firstUserId_secondUserId.firstUserId &&
          match.secondUserId === where.firstUserId_secondUserId.secondUserId
        ) ?? null
    },
    roommateTeamInvite: {
      rows: invites,
      create: async ({ data }: { data: Omit<(typeof invites)[number], "id" | "teamId" | "respondedAt" | "createdAt" | "updatedAt" | "status"> }) => {
        const created = {
          id: `invite-${invites.length + 1}`,
          ...data,
          teamId: null,
          status: "PENDING" as const,
          respondedAt: null,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        invites.push(created);
        return created;
      },
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        invites.find((invite) => matchesInvite(invite, where)) ?? null,
      findUnique: async ({ where }: { where: { id: string } }) => invites.find((invite) => invite.id === where.id) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => invites.filter((invite) => matchesInvite(invite, where)),
      update: async ({ where, data }: { where: { id: string }; data: Partial<(typeof invites)[number]> }) => {
        const invite = invites.find((record) => record.id === where.id)!;
        Object.assign(invite, data, { updatedAt: new Date() });
        return invite;
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<(typeof invites)[number]> }) => {
        const found = invites.filter((invite) => matchesInvite(invite, where));
        found.forEach((invite) => Object.assign(invite, data, { updatedAt: new Date() }));
        return { count: found.length };
      }
    },
    roommateTeam: {
      rows: teams,
      create: async ({ data }: { data: { dealRoomId: string } }) => {
        const team = teamRecord({ id: `team-${teams.length + 1}`, dealRoomId: data.dealRoomId });
        teams.push(team);
        return team;
      },
      findUnique: async ({ where }: { where: { id: string } }) => withMembers(teams.find((team) => team.id === where.id) ?? null, members),
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: Partial<Team> }) => {
        const found = teams.filter((team) => team.id === where.id && team.status === where.status);
        found.forEach((team) => Object.assign(team, data, { updatedAt: new Date() }));
        return { count: found.length };
      }
    },
    roommateTeamMember: {
      rows: members,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const member = members.find((record) => matchesMember(record, where));
        if (!member) return null;
        const team = teams.find((record) => record.id === member.teamId) ?? null;
        return { ...member, team: withMembers(team, members) };
      },
      createMany: async ({ data }: { data: Member[] }) => {
        members.push(...data.map((member, index) => ({ ...member, id: member.id ?? `member-${members.length + index + 1}` })));
        return { count: data.length };
      },
      updateMany: async ({ where, data }: { where: { teamId: string; active: boolean }; data: Partial<Member> }) => {
        const found = members.filter((member) => member.teamId === where.teamId && member.active === where.active);
        found.forEach((member) => Object.assign(member, data));
        return { count: found.length };
      }
    },
    dealRoom: {
      rows: dealRooms,
      updateMany: async ({ where, data }: { where: { id: string; status: string }; data: { status: "ARCHIVED" } }) => {
        const found = dealRooms.filter((room) => room.id === where.id && room.status === where.status);
        found.forEach((room) => Object.assign(room, data));
        return { count: found.length };
      }
    },
    rentalApplication: {
      rows: rentalApplications,
      updateMany: async ({
        where,
        data
      }: {
        where: { teamId: string; status: "SUBMITTED" };
        data: Partial<(typeof rentalApplications)[number]>;
      }) => {
        const found = rentalApplications.filter((record) => record.teamId === where.teamId && record.status === where.status);
        found.forEach((record) => Object.assign(record, data));
        return { count: found.length };
      }
    },
    $transaction: async <T>(operation: (transaction: typeof mock) => Promise<T>) => operation(mock)
  };

  return mock;
}

function createDealRoomsStub() {
  const stub = {
    calls: [] as Array<{ ownerId: string; teammateId: string }>,
    ensureForConfirmedTeam: async (_transaction: unknown, ownerId: string, teammateId: string) => {
      stub.calls.push({ ownerId, teammateId });
      return { id: "deal-room-1", status: "ACTIVE" };
    }
  };
  return stub;
}

function profileRecord(overrides: Partial<Profile>): Profile {
  return {
    id: "profile-a",
    ownerId: "user-a",
    name: "A",
    age: 22,
    role: "Student",
    image: "https://example.com/a.jpg",
    match: 90,
    budget: "$1,500/月",
    commute: "UCLA",
    tags: ["安静"],
    ...overrides
  };
}

function teamRecord(overrides: Partial<{
  id: string;
  status: "ACTIVE" | "DISSOLVED";
  dealRoomId: string | null;
  confirmedAt: Date;
  dissolvedAt: Date | null;
  dissolvedById: string | null;
  dissolveReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "team-1",
    status: "ACTIVE" as "ACTIVE" | "DISSOLVED",
    dealRoomId: "deal-room-1" as string | null,
    confirmedAt: new Date(),
    dissolvedAt: null as Date | null,
    dissolvedById: null as string | null,
    dissolveReason: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

function memberRecord(overrides: Partial<{
  id: string;
  teamId: string;
  userId: string;
  snapshot: Record<string, unknown>;
  active: boolean;
  joinedAt: Date;
  leftAt: Date | null;
}> = {}) {
  return {
    id: "member-1",
    teamId: "team-1",
    userId: "user-a",
    snapshot: {},
    active: true,
    joinedAt: new Date(),
    leftAt: null as Date | null,
    ...overrides
  };
}

function withMembers(team: Team | null, members: Member[]) {
  return team ? { ...team, members: members.filter((member) => member.teamId === team.id) } : null;
}

function matchesInvite(invite: Record<string, unknown>, where: Record<string, unknown>): boolean {
  if (typeof where.id === "string" && invite.id !== where.id) return false;
  if (typeof where.matchId === "string" && invite.matchId !== where.matchId) return false;
  if (typeof where.status === "string" && invite.status !== where.status) return false;
  if (where.expiresAt && typeof where.expiresAt === "object" && invite.expiresAt instanceof Date) {
    const lte = (where.expiresAt as { lte?: Date }).lte;
    if (lte && invite.expiresAt > lte) return false;
  }
  if (Array.isArray(where.OR)) {
    return where.OR.some((branch) => matchesInvite(invite, branch as Record<string, unknown>));
  }
  if (typeof where.inviterId === "string" && invite.inviterId !== where.inviterId) return false;
  if (typeof where.inviteeId === "string" && invite.inviteeId !== where.inviteeId) return false;
  return true;
}

function matchesMember(member: Member, where: Record<string, unknown>) {
  if (typeof where.userId === "string" && member.userId !== where.userId) return false;
  if (where.userId && typeof where.userId === "object") {
    const values = (where.userId as { in?: string[] }).in;
    if (values && !values.includes(member.userId)) return false;
  }
  if (typeof where.active === "boolean" && member.active !== where.active) return false;
  if (where.team && typeof where.team === "object") {
    const status = (where.team as { status?: string }).status;
    if (status && status !== "ACTIVE") return false;
  }
  return true;
}
