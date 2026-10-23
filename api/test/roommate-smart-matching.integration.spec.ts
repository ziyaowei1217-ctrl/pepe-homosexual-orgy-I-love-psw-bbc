import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DealRoomsService } from "../src/deal-rooms/deal-rooms.service";
import { MarketplaceService } from "../src/marketplace/marketplace.service";
import { RoommateMatchService } from "../src/roommates/roommate-match.service";
import { RoommatesService } from "../src/roommates/roommates.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("roommate smart matching on disposable PostgreSQL", () => {
  const database = createDisposablePostgres("roommate_smart_matching");
  let prisma: PrismaClient;
  let marketplace: MarketplaceService;
  let roommates: RoommatesService;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    marketplace = new MarketplaceService(prisma as never);
    roommates = new RoommatesService(prisma as never, new DealRoomsService(prisma as never), new RoommateMatchService(prisma as never));
    await prisma.user.createMany({ data: [{ id: "ana", email: "ana@smart.example" }, { id: "bea", email: "bea@smart.example" }] });
  }, 30000);

  afterAll(async () => {
    await prisma?.$disconnect();
    database.drop();
  });

  it("scores two profiles both ways, matches them and blocks undo after the match", async () => {
    const input = {
      age: 24,
      gender: "female",
      city: "LA",
      school: "UCLA",
      budgetMin: 1400,
      budgetMax: 1700,
      moveInDate: "2027-01-04",
      moveOutDate: "2027-06-12",
      dealbreakers: ["smoking"]
    };
    const anaMatching = await marketplace.createRoommateProfile("ana", "ana@smart.example", input);
    await marketplace.createRoommateProfile("bea", "bea@smart.example", { ...input, city: "Los Angeles", sleepSchedule: "early_bird" });
    expect(await prisma.roommateProfile.findUnique({ where: { ownerId: "ana" } })).toMatchObject({ matchingProfileId: anaMatching.id, name: "室友" });

    const anaDeck = await roommates.findDeck(20, "ana");
    const beaDeck = await roommates.findDeck(20, "bea");
    expect(anaDeck).toMatchObject({ total: 1, filteredOut: 0, viewer: { signedIn: true, hasProfile: true } });
    const [beaCard, anaCard] = [anaDeck.items[0]!, beaDeck.items[0]!];
    expect(beaCard).toMatchObject({ school: "UCLA", moveInDate: "2027-01-04", sleepSchedule: "early_bird", score: expect.any(Number) });
    expect(anaCard.score).toBe(beaCard.score);

    await expect(roommates.recordAction("ana", beaCard.id, "LIKE")).resolves.toMatchObject({ match: null, conversation: null });
    expect((await roommates.findDeck(20, "bea")).items[0]).toMatchObject({ id: anaCard.id, likedYou: true });
    const matched = await roommates.recordAction("bea", anaCard.id, "LIKE");
    expect(matched).toMatchObject({ match: { status: "ACTIVE" }, conversation: { matchId: matched.match!.id } });
    expect(await prisma.roommateConversationMember.count({ where: { conversationId: matched.conversation!.id } })).toBe(2);

    await expect(roommates.findDeckCandidate(anaCard.id, "bea")).resolves.toMatchObject({
      youLiked: true,
      likedYou: true,
      conversationId: matched.conversation!.id
    });
    await expect(roommates.undoLastAction("bea")).rejects.toMatchObject({ status: 409 });
    expect(await prisma.roommateAction.count()).toBe(2);
  });
});
