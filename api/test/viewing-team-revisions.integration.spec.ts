import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createDisposablePostgres } from "./support/disposable-postgres";
import { RoommateTeamsService } from "../src/roommate-teams/roommate-teams.service";
import { RoommateMatchService } from "../src/roommates/roommate-match.service";
import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";
import { DealThreadsService } from "../src/deal-threads/deal-threads.service";

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("viewing revisions and repeat teams (disposable PostgreSQL)", () => {
  const database = createDisposablePostgres("viewing_team_revisions");
  let prisma: PrismaClient;
  let threads: DealThreadsService;
  let teams: RoommateTeamsService;
  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    threads = new DealThreadsService(prisma as never);
    teams = new RoommateTeamsService(prisma as never, new DealRoomsService(prisma as never));
    await prisma.user.createMany({ data: ["a", "b", "host"].map(id => ({ id, email: `${id}@revision.example` })) });
    for (const id of ["a", "b"]) await prisma.roommateProfile.create({ data: {
      id: `profile-${id}`, ownerId: id, name: id, age: 25, role: "Student", image: "https://example.test/photo.png",
      match: 0, budget: "$1000", commute: "Westwood", tags: []
    } });
    await prisma.listing.create({ data: {
      id: "listing", ownerId: "host", title: "Approved listing", area: "Westwood", price: 1800, originalPrice: 1800,
      beds: 2, baths: 1, commute: "", transit: "", trust: "", tags: [], status: "APPROVED", availableFrom: new Date("2099-01-01"), availableTo: new Date("2099-12-31")
    } });
  }, 30000);
  afterAll(async () => { await prisma?.$disconnect(); database.drop(); });
  const initial = { timeLabel: "2099-06-01 09:00", iso: "2099-06-01T09:00:00Z", mode: "in-person" as const, participantNames: ["a", "b"] };

  it("rejects a decision from before a reschedule without writing a host message", async () => {
    const thread = await threads.createOrFindThread("a", { listingId: "listing" });
    const first = await threads.createViewingRequest("a", thread.id, initial);
    const request = first.viewingRequests[0];
    await threads.createViewingRequest("a", thread.id, { ...initial, timeLabel: "2099-06-15 23:00", iso: "2099-06-15T23:00:00Z", mode: "video", participantNames: ["a", "b", "guest"] });
    await expect(threads.confirmViewingRequest("host", thread.id, request.id, request.revision)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.viewingRequest.findUnique({ where: { id: request.id } })).toMatchObject({ status: "REQUESTED", revision: 2, mode: "VIDEO" });
    await expect(threads.declineViewingRequest("host", thread.id, request.id, request.revision)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.dealMessage.count({ where: { threadId: thread.id, senderId: "host" } })).toBe(0);
  });

  it("serializes simultaneous initial requests into one active revision", async () => {
    const thread = await threads.createOrFindThread("b", { listingId: "listing" });
    await Promise.all([
      threads.createViewingRequest("b", thread.id, initial),
      threads.createViewingRequest("b", thread.id, { ...initial, mode: "video" })
    ]);
    const requests = await prisma.viewingRequest.findMany({ where: { threadId: thread.id } });
    expect(requests).toHaveLength(1);
    expect(requests[0].revision).toBe(2);
    expect(await prisma.dealMessage.count({ where: { threadId: thread.id } })).toBe(2);
  });

  it("rejects a reschedule racing after the host read via atomic revision comparison", async () => {
    const thread = await threads.createOrFindThread("a", { listingId: "listing" });
    const snapshot = (await threads.createViewingRequest("a", thread.id, initial)).viewingRequests[0];
    let signalRead!: () => void;
    let resume!: () => void;
    const read = new Promise<void>(resolve => { signalRead = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    const client = new Proxy(prisma, { get(target, property) {
      if (property === "$transaction") return (operation: (tx: any) => Promise<any>) => target.$transaction(tx => operation(new Proxy(tx, { get(transaction, key) {
        if (key === "viewingRequest") return new Proxy(transaction.viewingRequest, { get(delegate, method) {
          if (method === "findUnique") return async (args: any) => {
            const row = await delegate.findUnique(args);
            signalRead();
            await gate;
            return row;
          };
          const value = Reflect.get(delegate, method);
          return typeof value === "function" ? value.bind(delegate) : value;
        } });
        return Reflect.get(transaction, key);
      } })));
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const host = new DealThreadsService(client as never);
    const confirming = host.confirmViewingRequest("host", thread.id, snapshot.id, snapshot.revision);
    // Attach the rejection assertion before unblocking the concurrent command.
    const rejected = expect(confirming).rejects.toMatchObject({ status: 409 });
    await read;
    try {
      await threads.createViewingRequest("a", thread.id, { ...initial, mode: "video", participantNames: ["new guest"] });
    } finally { resume(); }
    await rejected;
    expect(await prisma.viewingRequest.findUnique({ where: { id: snapshot.id } })).toMatchObject({ status: "REQUESTED", revision: snapshot.revision + 1 });
    expect(await prisma.dealMessage.count({ where: { threadId: thread.id, senderId: "host" } })).toBe(0);
  });

  it("commits only one simultaneous host decision and rolls status back if its message fails", async () => {
    const thread = await threads.createOrFindThread("b", { listingId: "listing" });
    const snapshot = (await threads.createViewingRequest("b", thread.id, initial)).viewingRequests[0];
    const outcomes = await Promise.allSettled([
      threads.confirmViewingRequest("host", thread.id, snapshot.id, snapshot.revision),
      threads.declineViewingRequest("host", thread.id, snapshot.id, snapshot.revision)
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await prisma.dealMessage.count({ where: { threadId: thread.id, senderId: "host" } })).toBe(1);

    const next = (await threads.createViewingRequest("b", thread.id, initial)).viewingRequests.find((item: any) => item.status === "REQUESTED")!;
    // A database trigger simulates a failed notification insert inside the real transaction.
    await prisma.$executeRawUnsafe(`CREATE FUNCTION fail_host_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."senderId" = 'host' THEN RAISE EXCEPTION 'notification unavailable'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_host_message BEFORE INSERT ON "DealMessage" FOR EACH ROW EXECUTE FUNCTION fail_host_message()`);
    try {
      await expect(threads.confirmViewingRequest("host", thread.id, next.id, next.revision)).rejects.toThrow();
      expect(await prisma.viewingRequest.findUnique({ where: { id: next.id } })).toMatchObject({ status: "REQUESTED", revision: next.revision });
    } finally { await prisma.$executeRawUnsafe(`DROP TRIGGER fail_host_message ON "DealMessage"`); }
  });

  it("does not deadlock a reschedule against a host decision inserting its notification", async () => {
    const thread = await threads.createOrFindThread("b", { listingId: "listing" });
    const snapshot = (await threads.createViewingRequest("b", thread.id, initial)).viewingRequests.find((item: any) => item.status === "REQUESTED")!;
    let hostUpdated!: () => void;
    let releaseHost!: () => void;
    let renterLocked!: () => void;
    const updated = new Promise<void>(resolve => { hostUpdated = resolve; });
    const hostGate = new Promise<void>(resolve => { releaseHost = resolve; });
    const locked = new Promise<void>(resolve => { renterLocked = resolve; });
    function gatedClient(actor: "host" | "renter") {
      return new Proxy(prisma, { get(target, property) {
        if (property === "$transaction") return (operation: (tx: any) => Promise<any>) => target.$transaction(tx => operation(new Proxy(tx, { get(transaction, key) {
          if (actor === "host" && key === "viewingRequest") return new Proxy(transaction.viewingRequest, { get(delegate, method) {
            if (method === "updateMany") return async (args: any) => {
              const result = await delegate.updateMany(args);
              hostUpdated();
              await hostGate;
              return result;
            };
            const value = Reflect.get(delegate, method);
            return typeof value === "function" ? value.bind(delegate) : value;
          } });
          if (actor === "renter" && key === "$queryRaw") return async (...args: any[]) => {
            const result = await (transaction.$queryRaw as any)(...args);
            renterLocked();
            return result;
          };
          return Reflect.get(transaction, key);
        } })));
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      } });
    }
    const host = new DealThreadsService(gatedClient("host") as never);
    const renter = new DealThreadsService(gatedClient("renter") as never);
    const confirming = host.confirmViewingRequest("host", thread.id, snapshot.id, snapshot.revision);
    await updated;
    const rescheduling = renter.createViewingRequest("b", thread.id, { ...initial, mode: "video" });
    const outcomesPromise = Promise.allSettled([confirming, rescheduling]);
    await locked;
    releaseHost();
    const outcomes = await outcomesPromise;
    expect(outcomes.map(result => result.status), outcomes.filter(result => result.status === "rejected").map(result => String(result.reason)).join("\n")).toEqual(["fulfilled", "fulfilled"]);
    expect(await prisma.viewingRequest.findUnique({ where: { id: snapshot.id } })).toMatchObject({ status: "REQUESTED", mode: "VIDEO", revision: snapshot.revision + 2 });
  });

  it("allows the same invitation direction again while retaining the archived room and team", async () => {
    const matches = new RoommateMatchService(prisma as never);
    await matches.recordAction("a", "profile-b", "LIKE");
    await matches.recordAction("b", "profile-a", "LIKE");
    const firstInvite = await teams.invite("a", { roommateProfileId: "profile-b" });
    const first = await teams.accept("b", firstInvite.id);
    const historicalThread = await threads.createOrFindThread("a", { listingId: "listing", dealRoomId: first.dealRoomId! });
    const tour = await new DealRoomsService(prisma as never).requestGroupTour("a", first.dealRoomId!);
    await teams.leave("a", first.id);
    const secondInvite = await teams.invite("a", { roommateProfileId: "profile-b" });
    const second = await teams.accept("b", secondInvite.id);
    expect(second.dealRoomId).not.toBe(first.dealRoomId);
    expect(await prisma.roommateTeam.findUnique({ where: { id: first.id } })).toMatchObject({ status: "DISSOLVED", dealRoomId: first.dealRoomId });
    expect(await prisma.dealRoom.findUnique({ where: { id: first.dealRoomId! } })).toMatchObject({ status: "ARCHIVED" });
    expect(await prisma.dealThread.findUnique({ where: { id: historicalThread.id } })).toMatchObject({ dealRoomId: first.dealRoomId });
    expect(await prisma.tourRequest.findUnique({ where: { id: tour.id } })).toMatchObject({ dealRoomId: first.dealRoomId });
    expect(await prisma.dealRoomMember.count({ where: { dealRoomId: first.dealRoomId! } })).toBe(2);
    expect(await prisma.roommateTeamMember.count({ where: { active: true } })).toBe(2);
    expect((await teams.accept("b", secondInvite.id)).id).toBe(second.id);
  });
});
