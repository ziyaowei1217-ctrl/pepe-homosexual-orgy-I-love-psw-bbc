import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDisposablePostgres } from "./support/disposable-postgres";
import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";
import { RoommateTeamsService } from "../src/roommate-teams/roommate-teams.service";
import { RoommateMatchService } from "../src/roommates/roommate-match.service";

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("group tour lifecycle on disposable PostgreSQL", () => {
  const database = createDisposablePostgres("round4_roommate_tours");
  let prisma: PrismaClient;
  beforeAll(async () => {
    database.create(); database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await prisma.user.createMany({ data: ["a", "b"].map(id => ({ id, email: `${id}@round4.example` })) });
    for (const id of ["a", "b"]) await prisma.roommateProfile.create({ data: {
      id: `profile-${id}`, ownerId: id, name: id, age: 25, role: "Student", image: "https://example.test/photo.png",
      match: 0, budget: "$1000", commute: "Westwood", tags: []
    } });
  }, 30000);
  afterAll(async () => { await prisma?.$disconnect(); database.drop(); });

  it("rejects a tour request whose previously active team dissolved before the write", async () => {
    const rooms = new DealRoomsService(prisma as never);
    const teams = new RoommateTeamsService(prisma as never, rooms);
    const matches = new RoommateMatchService(prisma as never);
    await matches.recordAction("a", "profile-b", "LIKE");
    await matches.recordAction("b", "profile-a", "LIKE");
    const invite = await teams.invite("a", { roommateProfileId: "profile-b" });
    const team = await teams.accept("b", invite.id);
    let signalRead!: () => void;
    let release!: () => void;
    const read = new Promise<void>(resolve => { signalRead = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const client = new Proxy(prisma, { get(target, key) {
      if (key === "dealRoom") return new Proxy(target.dealRoom, { get(delegate, method) {
        if (method === "findFirst") return async (args: any) => {
          const row = await delegate.findFirst(args);
          signalRead(); await gate; return row;
        };
        const value = Reflect.get(delegate, method);
        return typeof value === "function" ? value.bind(delegate) : value;
      } });
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const request = new DealRoomsService(client as never).requestGroupTour("a", team.dealRoomId!);
    const outcome = request.then(value => ({ ok: true, value }), error => ({ ok: false, error }));
    await read;
    try { await teams.leave("b", team.id); } finally { release(); }
    expect(await outcome).toMatchObject({ ok: false, error: { status: 404 } });
    expect(await prisma.tourRequest.count({ where: { dealRoomId: team.dealRoomId! } })).toBe(0);
    expect(await prisma.dealRoom.findUnique({ where: { id: team.dealRoomId! } })).toMatchObject({ status: "ARCHIVED" });
  });
});
