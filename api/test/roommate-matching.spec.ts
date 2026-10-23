import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { RoommateMatchingProfile } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  buildRoommateCard,
  buildRoommateDeck,
  RoommateCardRow,
  RoommateDeckContext
} from "../src/roommates/matching";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

const now = new Date("2026-12-01T12:00:00.000Z");
const allMissing = ["age", "gender", "dates", "budget", "city", "neighborhoods", "roomType", "sleepSchedule", "cleanliness"];
const complete: Partial<RoommateMatchingProfile> = {
  gender: "female",
  school: "UCLA",
  city: "Los Angeles",
  budgetMin: 1400,
  budgetMax: 1700,
  moveInDate: day("2027-01-04"),
  moveOutDate: day("2027-06-12"),
  preferredNeighborhoods: ["Westwood", "Sawtelle"],
  roomType: "private_room",
  sleepSchedule: "early_bird",
  cleanliness: "very_tidy",
  guests: "rarely",
  smoking: "no",
  pets: "none",
  intro: "UCLA 研究生"
};
/** Only what hard filters need; lifestyle stays unknown so candidates tie on fit. */
const bare: Partial<RoommateMatchingProfile> = {
  gender: "female",
  city: "Los Angeles",
  budgetMin: 1400,
  budgetMax: 1700,
  moveInDate: day("2027-01-04"),
  moveOutDate: day("2027-06-12")
};

describe("roommate matching engine", () => {
  it("applies hard filters in both directions and reports them as conflicts", () => {
    const viewer = card("viewer", { ...complete, dealbreakers: ["smoking", "pets"], city: "LA" });
    const candidates = [
      card("ok", complete),
      card("alias-city", { ...complete, city: " los  angeles " }),
      card("unknowns-pass", { gender: "female" }),
      card("wants-men", { ...complete, genderPreference: "male" }),
      card("no-night-owls", { ...complete, dealbreakers: ["night_owl"] }),
      card("smoker", { ...complete, smoking: "yes" }),
      card("pet", { ...complete, pets: "has_pet" }),
      card("sf", { ...complete, city: "SF" }),
      card("summer", { ...complete, moveInDate: day("2027-06-01"), moveOutDate: day("2027-08-30") }),
      card("pricey", { ...complete, budgetMin: 2000, budgetMax: 2400 })
    ];
    const nightOwlViewer = card("viewer", { ...complete, sleepSchedule: "night_owl", city: "LA" });

    const deck = buildRoommateDeck(candidates, context({ viewer }), 20);
    const owlDeck = buildRoommateDeck(candidates, context({ viewer: nightOwlViewer }), 20);

    expect(ids(deck)).toEqual(expect.arrayContaining(["ok", "alias-city", "unknowns-pass", "no-night-owls"]));
    expect(deck.total).toBe(4);
    expect(deck.filteredOut).toBe(6);
    expect(ids(owlDeck)).not.toContain("no-night-owls");
    expect(ids(owlDeck)).toEqual(expect.arrayContaining(["smoker", "pet"]));

    const strictViewer = card("viewer", { ...complete, genderPreference: "female" });
    expect(ids(buildRoommateDeck([card("man", { ...complete, gender: "male" }), card("unknown", { ...complete, gender: null })], context({ viewer: strictViewer }), 20))).toEqual([]);

    const watchouts = (target: RoommateCardRow, from = viewer) => buildRoommateCard(target, from, flags()).watchouts;
    expect(watchouts(candidates[3]!)).toContain("TA 只找男生室友");
    expect(watchouts(card("man", { ...complete, gender: "male" }), strictViewer)).toContain("你只找女生室友");
    expect(watchouts(candidates[4]!, nightOwlViewer)).toContain("TA 不接受夜猫子");
    expect(watchouts(candidates[5]!)).toContain("你不接受抽烟");
    expect(watchouts(candidates[6]!)).toContain("你不接受宠物");
    expect(watchouts(candidates[7]!)).toContain("不在同一城市");
    expect(watchouts(candidates[8]!)).toContain("入住时间重合不足 3 周");
    expect(watchouts(candidates[9]!)).toContain("预算差距约 $300");
    // A blocked pair gets no score or tier on the detail page, only the reasons it is blocked.
    expect(buildRoommateCard(candidates[3]!, viewer, flags())).toMatchObject({ score: null, tier: null });
  });

  it("handles same-day stays, open-ended stays, a lone $0 budget and who smokes", () => {
    const sameDay = card("viewer", { ...complete, moveInDate: day("2027-01-04"), moveOutDate: day("2027-01-04") });
    expect(buildRoommateDeck([card("later", { ...complete, moveInDate: day("2027-09-01"), moveOutDate: day("2027-12-01") })], context({ viewer: sameDay }), 20).total).toBe(0);

    const zeroBudget = card("viewer", { ...complete, budgetMin: 0, budgetMax: null });
    const zeroDeck = buildRoommateDeck([card("a", complete), card("b", { ...complete, budgetMin: 900, budgetMax: 1200 })], context({ viewer: zeroBudget }), 20);
    expect(zeroDeck).toMatchObject({ total: 2, filteredOut: 0, viewer: { missing: ["budget"] } });

    const openViewer = card("viewer", { ...complete, moveOutDate: null });
    const leaves = card("leaves", { ...complete, moveInDate: day("2027-01-06"), moveOutDate: day("2027-02-15") });
    expect(buildRoommateCard(leaves, openViewer, flags()).watchouts).toContain("TA 2/15 就搬走");
    expect(buildRoommateCard(card("open", { ...complete, moveOutDate: null }), openViewer, flags()).reasons).toContain("入住时间相近，都没定搬走日期");
    // A fixed end after the open side's one-year guess is not an early move-out.
    const lateOpen = card("viewer", { ...complete, moveInDate: day("2027-03-15"), moveOutDate: null });
    const yearLease = card("lease", { ...complete, moveInDate: day("2027-09-01"), moveOutDate: day("2028-09-01") });
    expect(buildRoommateCard(yearLease, lateOpen, flags()).watchouts).toContain("TA 9/1 才入住，比你晚 170 天");
    expect(buildRoommateCard(lateOpen, yearLease, flags()).watchouts).toContain("TA 3/15 就入住，比你早 170 天");
    const longLease = card("long", { ...complete, moveInDate: day("2027-01-04"), moveOutDate: day("2028-02-15") });
    expect(buildRoommateCard(longLease, openViewer, flags()).reasons).toContain("入住时间相近，你没定搬走日期");

    const smoker = card("viewer", { ...complete, smoking: "yes" });
    expect(buildRoommateCard(card("non-smoker", complete), smoker, flags()).watchouts).toContain("你抽烟，TA 不抽烟");
    expect(buildRoommateCard(smoker, card("viewer", complete), flags()).watchouts).toContain("TA 抽烟");
  });

  it("keeps the budget score continuous and derives the tier from the shown score", () => {
    const viewer = card("viewer", { ...complete, budgetMin: 1000, budgetMax: 1700 });
    const budgetScore = (min: number) =>
      buildRoommateCard(card("c", { ...complete, budgetMin: min, budgetMax: 2200 }), viewer, flags()).breakdown.find((item) => item.key === "budget")!.score;
    expect(Math.abs(budgetScore(1800) - budgetScore(1801))).toBeLessThanOrEqual(1);

    const eighty = buildRoommateCard(card("c", { ...complete, sleepSchedule: "regular", guests: "often", roomType: "shared_room", cleanliness: null }, { age: 18 }), card("viewer", complete), flags());
    expect(eighty).toMatchObject({ score: 80, tier: "great" });
  });

  it("uses a harmonic two-sided score so a one-sided great fit ranks below a balanced good fit", () => {
    const viewer = card("viewer", {
      ...complete,
      moveInDate: day("2027-01-04"),
      moveOutDate: day("2027-03-04"),
      preferredNeighborhoods: ["Westwood"],
      smoking: "outside",
      pets: "has_pet",
      cleanliness: "tidy",
      guests: "sometimes"
    });
    const oneSided = card("one-sided", {
      ...complete,
      moveInDate: day("2026-12-15"),
      moveOutDate: day("2027-08-30"),
      preferredNeighborhoods: ["Westwood", "Sawtelle", "Palms", "Culver City", "Koreatown", "DTLA"],
      smoking: "no",
      pets: "none",
      cleanliness: "very_tidy",
      guests: "rarely"
    });
    const balanced = card(
      "balanced",
      {
        ...complete,
        moveInDate: day("2027-01-04"),
        moveOutDate: day("2027-03-04"),
        preferredNeighborhoods: ["Westwood"],
        school: "USC",
        roomType: "entire_place",
        sleepSchedule: "regular",
        smoking: "outside",
        pets: "has_pet",
        cleanliness: "tidy",
        guests: "sometimes"
      },
      { age: 30 }
    );

    const deck = buildRoommateDeck([oneSided, balanced], context({ viewer }), 20);
    const [first, second] = deck.items;

    expect(ids(deck)).toEqual(["balanced", "one-sided"]);
    expect(first!.score).toBeGreaterThan(second!.score!);
    expect(second!.breakdown.find((item) => item.key === "area")!.score).toBe(29);
  });

  it("scores unknown and legacy free-text values as 0.5 and treats budget containment as a full fit", () => {
    const viewer = card("viewer", { ...complete, budgetMin: 1000, budgetMax: 2000 });
    const sparse = card("sparse", { sleepSchedule: "早睡", cleanliness: "爱干净" });
    const contained = card("contained", { ...complete, budgetMin: 1500, budgetMax: 1500 });

    const result = buildRoommateCard(sparse, viewer, flags());

    expect(result).toMatchObject({ sleepSchedule: null, cleanliness: null, score: 51, tier: "fair" });
    expect(result.breakdown).toEqual([{ key: "age", label: "年龄", score: 100 }]);
    expect(result.reasons).toEqual(["年龄相差不到 1 岁"]);
    expect(result.watchouts).toEqual([]);
    expect(result.icebreaker).toBe("问问 TA：理想的室友是什么样的？");
    expect(buildRoommateCard(contained, viewer, flags()).breakdown.find((item) => item.key === "budget")!.score).toBe(100);
  });

  it("writes Chinese reasons, watchouts and icebreakers from the real values", () => {
    const viewer = card("viewer", complete);
    const close = card("close", { ...complete, budgetMin: 1300, budgetMax: 1500, preferredNeighborhoods: ["Sawtelle", "westwood", "Palms"] }, { age: 23 });
    const owl = card("owl", { ...complete, moveInDate: day("2027-02-01"), budgetMin: 1750, budgetMax: 1900, sleepSchedule: "night_owl" });
    const leavesEarly = card("leaves-early", { ...complete, moveInDate: day("2027-01-20"), moveOutDate: day("2027-02-28") });

    expect(buildRoommateCard(close, viewer, flags())).toMatchObject({
      score: 98,
      tier: "great",
      reasons: ["入住时间重合约 5 个月", "预算区间重合 $1,400–$1,500", "都很爱干净"],
      watchouts: [],
      icebreaker: "问问 TA：入住和搬走的日期能调整吗？"
    });
    expect(buildRoommateCard(owl, viewer, flags())).toMatchObject({
      reasons: ["入住时间重合约 4 个月", "都考虑 Westwood、Sawtelle", "都很爱干净"],
      watchouts: ["作息不同：你早睡早起，TA 是夜猫子", "预算差距约 $50"],
      icebreaker: "问问 TA：平时几点睡、几点起？"
    });
    expect(buildRoommateCard(leavesEarly, viewer, flags()).watchouts).toEqual(["TA 2/28 就搬走，比你早 104 天"]);
  });

  it("learns from more than 10 LIKE/PASS swipes, ranking only, and never from gender", () => {
    const viewer = card("viewer", bare);
    const liked = { ...bare, school: "UCLA", preferredNeighborhoods: ["Westwood"], roomType: "private_room", sleepSchedule: "early_bird", cleanliness: "very_tidy", guests: "rarely", smoking: "no", pets: "none" };
    const passed = { ...bare, school: "USC", preferredNeighborhoods: ["Koreatown"], roomType: "shared_room", sleepSchedule: "night_owl", cleanliness: "relaxed", guests: "often", smoking: "outside", pets: "has_pet" };
    const candidates = [card("like-alike", liked), card("pass-alike", passed)];
    const history = (count: number, likedTarget = liked, passedTarget = passed) =>
      Array.from({ length: count }, (_, index) => ({
        action: index % 2 === 0 ? ("LIKE" as const) : ("PASS" as const),
        roommateProfile: card(`seen-${index}`, index % 2 === 0 ? likedTarget : passedTarget)
      }));
    const deckWith = (items: RoommateDeckContext["history"]) => buildRoommateDeck(candidates, context({ viewer, history: items }), 20);

    expect(deckWith(history(10))).toEqual(deckWith([]));
    expect(ids(deckWith(history(40)))[0]).toBe("like-alike");
    expect(ids(deckWith(history(40, passed, liked)))[0]).toBe("pass-alike");
    expect(new Set(deckWith(history(40)).items.map((item) => item.score)).size).toBe(1);

    const genderOnly = [card("woman", { ...bare, gender: "female" }), card("man", { ...bare, gender: "male" })];
    const genderHistory = Array.from({ length: 40 }, (_, index) => ({
      action: index % 2 === 0 ? ("LIKE" as const) : ("PASS" as const),
      roommateProfile: card(`seen-${index}`, { ...bare, gender: index % 2 === 0 ? "male" : "female" })
    }));
    expect(buildRoommateDeck(genderOnly, context({ viewer, history: genderHistory }), 20)).toEqual(
      buildRoommateDeck(genderOnly, context({ viewer }), 20)
    );
  });

  it("balances attention, applies swipe state and puts LATER cards last", () => {
    const viewer = card("viewer", bare);
    const rows = [
      card("best-later", complete),
      card("popular", bare),
      card("quiet", bare),
      card("liked", bare),
      card("passed-recently", bare),
      card("passed-long-ago", bare),
      card("viewer-own", bare, { ownerId: "viewer-user" })
    ];
    const deck = buildRoommateDeck(
      rows,
      context({
        viewer,
        actions: [
          { roommateProfileId: "best-later", action: "LATER", updatedAt: now },
          { roommateProfileId: "liked", action: "LIKE", updatedAt: now },
          { roommateProfileId: "passed-recently", action: "PASS", updatedAt: daysBefore(20) },
          { roommateProfileId: "passed-long-ago", action: "PASS", updatedAt: daysBefore(21) }
        ],
        inboundLikes: new Map([["popular", 30]]),
        likedBy: new Set(["owner-quiet"])
      }),
      20
    );

    expect(ids(deck)).toEqual(["quiet", "passed-long-ago", "popular", "best-later"]);
    expect(deck.items.map((item) => [item.later, item.likedYou])).toEqual([[false, true], [false, false], [false, false], [true, false]]);
    expect(deck.total).toBe(4);
  });

  it("re-ranks the top of the deck for diversity", () => {
    const viewer = card("viewer", bare);
    const same = { ...bare, school: "UCLA", preferredNeighborhoods: ["Westwood"], sleepSchedule: "early_bird", cleanliness: "tidy", roomType: "private_room" };
    const different = { ...bare, gender: "nonbinary", school: "USC", preferredNeighborhoods: ["Koreatown"], sleepSchedule: "night_owl", cleanliness: "relaxed", roomType: "shared_room" };
    const deck = buildRoommateDeck(
      [card("same-1", same), card("same-2", same), card("same-3", same), card("different", different)],
      context({ viewer, inboundLikes: new Map([["different", 10]]) }),
      20
    );

    expect(ids(deck)[1]).toBe("different");
  });

  it("never pads the deck and is deterministic for a fixed now", () => {
    const viewer = card("viewer", complete);
    const rows = [card("a", complete), card("b", complete)];

    expect(buildRoommateDeck(rows, context({ viewer }), 20)).toMatchObject({ total: 2, items: [{}, {}] });
    expect(buildRoommateDeck(rows, context({ viewer }), 1)).toMatchObject({ total: 2, items: [{}] });
    expect(buildRoommateDeck(rows, context({ viewer }), 20)).toEqual(buildRoommateDeck(rows, context({ viewer }), 20));
    expect(buildRoommateDeck([], context({ viewer }), 20)).toMatchObject({ items: [], total: 0, filteredOut: 0 });
  });

  it("serves guests unscored cards and hides strict gender preferences it cannot verify", () => {
    const rows = [card("open", complete), card("strict", { ...complete, genderPreference: "female" })];
    const guestDeck = buildRoommateDeck(rows, context({ userId: null }), 20);
    const noProfileDeck = buildRoommateDeck(rows, context({ viewer: card("viewer", null) }), 20);

    expect(ids(guestDeck)).toEqual(["open"]);
    expect(guestDeck).toMatchObject({
      total: 1,
      filteredOut: 0,
      viewer: { signedIn: false, hasProfile: false, missing: allMissing }
    });
    expect(guestDeck.items[0]).toMatchObject({ score: null, tier: null, reasons: [], watchouts: [], breakdown: [], icebreaker: null });
    expect(noProfileDeck.viewer).toEqual({ signedIn: true, hasProfile: false, missing: allMissing });
    expect(buildRoommateDeck(rows, context({ viewer: card("viewer", { city: "LA" }) }), 20).viewer.missing).toEqual(
      allMissing.filter((field) => field !== "age" && field !== "city")
    );
  });
});

describe("roommate deck HTTP endpoints", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves an honest empty deck to guests and rejects removed query params", async () => {
    const http = request(app.getHttpServer());

    await http.get("/api/v1/roommates/deck").expect(200).expect({
      items: [],
      total: 0,
      filteredOut: 0,
      viewer: { signedIn: false, hasProfile: false, missing: allMissing }
    });
    await http.get("/api/v1/roommates/deck?cursor=12&school=UCLA").expect(400);
    await http.get("/api/v1/roommates/deck?limit=51").expect(400);
    await http.get("/api/v1/roommates/deck/missing-card").expect(404);
  });

  it("scores two real profiles both ways, matches them and blocks undo after the match", async () => {
    const http = request(app.getHttpServer());
    const [ana, bea] = [await signIn(app, "ana@example.com"), await signIn(app, "bea@example.com")];
    const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
    const profile = { age: 24, gender: "female", city: "LA", budgetMin: 1400, budgetMax: 1700, moveInDate: "2027-01-04", moveOutDate: "2027-06-12", school: "UCLA" };
    await http.post("/api/v1/roommate-profiles").set(auth(ana)).send(profile).expect(201);
    await http.post("/api/v1/roommate-profiles").set(auth(bea)).send({ ...profile, city: "Los Angeles" }).expect(201);

    const anaDeck = await http.get("/api/v1/roommates/deck").set(auth(ana)).expect(200);
    expect(anaDeck.body).toMatchObject({ total: 1, viewer: { signedIn: true, hasProfile: true } });
    const beaCard = anaDeck.body.items[0];
    expect(beaCard).toMatchObject({ name: "室友", school: "UCLA", moveInDate: "2027-01-04", score: expect.any(Number), likedYou: false });
    await http.get(`/api/v1/roommates/deck/${beaCard.id}`).set(auth(bea)).expect(404);

    const firstLike = await http.post(`/api/v1/roommates/${beaCard.id}/actions`).set(auth(ana)).send({ action: "LIKE" }).expect(201);
    expect(firstLike.body).toMatchObject({ match: null, conversation: null, dealRoom: null });
    expect(firstLike.body).not.toHaveProperty("feedback");
    await http.get("/api/v1/roommates/deck").set(auth(ana)).expect(200).expect(({ body }: { body: { items: unknown[] } }) => expect(body.items).toEqual([]));
    await http.post("/api/v1/roommates/actions/undo").set(auth(ana)).expect(200).expect({ roommateProfileId: beaCard.id, action: "LIKE" });
    await http.post("/api/v1/roommates/actions/undo").set(auth(ana)).expect(409);
    await http.post(`/api/v1/roommates/${beaCard.id}/actions`).set(auth(ana)).send({ action: "LIKE" }).expect(201);

    const beaDeck = await http.get("/api/v1/roommates/deck").set(auth(bea)).expect(200);
    const anaCard = beaDeck.body.items[0];
    expect(anaCard).toMatchObject({ likedYou: true, score: beaCard.score });
    const match = await http.post(`/api/v1/roommates/${anaCard.id}/actions`).set(auth(bea)).send({ action: "LIKE" }).expect(201);
    expect(match.body).toMatchObject({ match: { id: expect.any(String), status: "ACTIVE" }, conversation: { id: expect.any(String), matchId: match.body.match.id } });

    await http.get(`/api/v1/roommates/deck/${anaCard.id}`).set(auth(bea)).expect(200).expect(({ body }: { body: Record<string, unknown> }) => {
      expect(body).toMatchObject({ youLiked: true, likedYou: true, conversationId: match.body.conversation.id });
    });
    await http.post("/api/v1/roommates/actions/undo").set(auth(bea)).expect(409).expect(({ body }: { body: { message: string } }) => {
      expect(body.message).toBe("已经配对，不能撤回");
    });
  });
});

function card(id: string, matching: Partial<RoommateMatchingProfile> | null, overrides: Partial<RoommateCardRow> = {}): RoommateCardRow {
  return {
    id,
    ownerId: `owner-${id}`,
    name: id,
    age: 24,
    role: "",
    image: `https://example.com/${id}.jpg`,
    match: 0,
    budget: "",
    commute: "",
    tags: [],
    status: "active",
    archivedAt: null,
    localReciprocalLike: false,
    createdAt: day("2026-10-01"),
    matchingProfileId: matching ? `matching-${id}` : null,
    matchingProfile: matching && {
      id: `matching-${id}`,
      userId: `profile-${id}`,
      school: null,
      city: null,
      budgetMin: null,
      budgetMax: null,
      moveInDate: null,
      moveOutDate: null,
      preferredNeighborhoods: [],
      roomType: null,
      cleanliness: null,
      sleepSchedule: null,
      smoking: null,
      pets: null,
      guests: null,
      intro: null,
      lookingFor: null,
      gender: null,
      genderPreference: "any",
      dealbreakers: [],
      status: "active",
      createdAt: day("2026-10-01"),
      updatedAt: daysBefore(1),
      ...matching
    },
    ...overrides
  };
}

function context(overrides: Partial<RoommateDeckContext> = {}): RoommateDeckContext {
  return {
    now,
    userId: "viewer-user",
    viewer: null,
    actions: [],
    likedBy: new Set(),
    inboundLikes: new Map(),
    lastActionAt: new Map(),
    history: [],
    ...overrides
  };
}

function flags() {
  return { likedYou: false, youLiked: false, conversationId: null };
}

function ids(deck: { items: Array<{ id: string }> }) {
  return deck.items.map((item) => item.id);
}

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function daysBefore(days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

async function signIn(app: INestApplication, email: string) {
  const http = request(app.getHttpServer());
  const codeResponse = await http.post("/api/v1/auth/email-code").send({ email }).expect(201);
  const sessionResponse = await http
    .post("/api/v1/auth/verify-email")
    .send({ email, code: codeResponse.body.devCode })
    .expect(201);

  return sessionResponse.body.accessToken as string;
}
