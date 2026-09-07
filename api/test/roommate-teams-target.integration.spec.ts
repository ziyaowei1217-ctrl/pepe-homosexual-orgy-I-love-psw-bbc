import "reflect-metadata";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthGuard } from "../src/auth/auth.guard";
import { ApplicationsService } from "../src/applications/applications.service";
import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";
import { DemoPaymentsService } from "../src/demo-payments/demo-payments.service";
import { RoommateMatchService } from "../src/roommates/roommate-match.service";
import { RoommateTeamsController } from "../src/roommate-teams/roommate-teams.controller";
import { RoommateTeamsService } from "../src/roommate-teams/roommate-teams.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const request = require("supertest") as (server: unknown) => any;

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("team leave targets on disposable PostgreSQL", () => {
  const database = createDisposablePostgres("round6_team_targets");
  let prisma: PrismaClient;
  let app: INestApplication;
  let teams: RoommateTeamsService;
  let fixtureIndex = 0;
  let actorId: string;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    teams = new RoommateTeamsService(prisma as never, new DealRoomsService(prisma as never));
    const module = await Test.createTestingModule({
      controllers: [RoommateTeamsController],
      providers: [{ provide: RoommateTeamsService, useValue: teams }]
    }).overrideGuard(AuthGuard).useValue({
      canActivate(context: { switchToHttp(): { getRequest(): { user: { id: string } } } }) {
        context.switchToHttp().getRequest().user = { id: actorId };
        return true;
      }
    }).compile();
    app = module.createNestApplication();
    await app.init();
  }, 30000);

  afterAll(async () => {
    await app?.close();
    await prisma?.$disconnect();
    database.drop();
  });

  it("rejects a stale Team A leave command without changing replacement Team B or its submitted application", async () => {
    const fixture = await replacementTeam();
    const before = await snapshot(fixture);

    await request(app.getHttpServer()).post("/roommate-teams/current/leave")
      .send({ teamId: fixture.first.id }).expect(409);

    expect(await snapshot(fixture)).toEqual(before);
    expect(await teams.current(actorId)).toMatchObject({ id: fixture.second.id, status: "ACTIVE" });
  });

  it("rejects missing and malformed team IDs before any team or application change", async () => {
    const fixture = await replacementTeam();
    const before = await snapshot(fixture);
    const invalidBodies = [
      {}, { teamId: null }, { teamId: "" }, { teamId: "   " }, { teamId: 123 },
      { teamId: [] }, { teamId: "x".repeat(192) }, { teamId: fixture.second.id, unexpected: true }
    ];
    for (const body of invalidBodies) {
      await request(app.getHttpServer()).post("/roommate-teams/current/leave").send(body).expect(400);
      expect(await snapshot(fixture)).toEqual(before);
    }
  });

  it("dissolves the explicitly selected active team and withdraws its submitted application", async () => {
    const fixture = await replacementTeam();
    const firstBefore = await prisma.roommateTeam.findUniqueOrThrow({ where: { id: fixture.first.id }, include: { members: true } });

    await request(app.getHttpServer()).post("/roommate-teams/current/leave")
      .send({ teamId: fixture.second.id }).expect(201)
      .expect(({ body }: { body: Record<string, unknown> }) => expect(body).toMatchObject({
        id: fixture.second.id, status: "DISSOLVED", dissolvedById: actorId
      }));

    expect(await teams.current(actorId)).toBeNull();
    const after = await snapshot(fixture);
    expect(after.second?.members.every(member => !member.active && member.leftAt)).toBe(true);
    expect(after.room).toMatchObject({ status: "ARCHIVED" });
    expect(after.application).toMatchObject({ status: "WITHDRAWN", decisionReason: "TEAM_DISSOLVED", activeKey: null });
    expect(after.first).toEqual(firstBefore);
    await request(app.getHttpServer()).post("/roommate-teams/current/leave")
      .send({ teamId: fixture.second.id }).expect(404);
    expect(await snapshot(fixture)).toEqual(after);
  });

  async function replacementTeam() {
    const prefix = `fixture-${++fixtureIndex}`;
    const [a, b, c, host] = ["a", "b", "c", "host"].map(id => `${prefix}-${id}`);
    actorId = a;
    await prisma.user.createMany({ data: [a, b, c, host].map(id => ({ id, email: `${id}@round6.example` })) });
    for (const id of [a, b, c]) await prisma.roommateProfile.create({ data: {
      id: `profile-${id}`, ownerId: id, name: id, age: 25, role: "Student", image: "https://example.test/photo.png",
      match: 0, budget: "$1000", commute: "LA", tags: []
    } });
    const matches = new RoommateMatchService(prisma as never);
    for (const peer of [b, c]) {
      await matches.recordAction(a, `profile-${peer}`, "LIKE");
      await matches.recordAction(peer, `profile-${a}`, "LIKE");
    }
    const inviteA = await teams.invite(a, { roommateProfileId: `profile-${b}` });
    const first = await teams.accept(b, inviteA.id);
    await teams.leave(b, first.id);
    const inviteB = await teams.invite(a, { roommateProfileId: `profile-${c}` });
    const second = await teams.accept(c, inviteB.id);
    const listing = await prisma.listing.create({ data: {
      ownerId: host, title: "Team B fixture", area: "LA", price: 1800, originalPrice: 1800,
      beds: 2, baths: 1, commute: "", transit: "", trust: "", tags: [], status: "APPROVED",
      availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31")
    } });
    const applications = new ApplicationsService(prisma as never, new DemoPaymentsService(prisma as never));
    const draft = await applications.create(a, `${prefix}-create`, {
      listingId: listing.id, scope: "TEAM", teamId: second.id, moveIn: "2099-06-01", moveOut: "2099-09-01",
      schoolOrOccupation: "Test", incomeBand: "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE", note: ""
    });
    await applications.submit(a, draft.id, `${prefix}-submit`);
    return { first, second, applicationId: draft.id };
  }

  async function snapshot(fixture: Awaited<ReturnType<typeof replacementTeam>>) {
    const [first, second, room, application] = await Promise.all([
      prisma.roommateTeam.findUnique({ where: { id: fixture.first.id }, include: { members: true } }),
      prisma.roommateTeam.findUnique({ where: { id: fixture.second.id }, include: { members: true } }),
      prisma.dealRoom.findUnique({ where: { id: fixture.second.dealRoomId! } }),
      prisma.rentalApplication.findUnique({ where: { id: fixture.applicationId } })
    ]);
    return { first, second, room, application };
  }
});
