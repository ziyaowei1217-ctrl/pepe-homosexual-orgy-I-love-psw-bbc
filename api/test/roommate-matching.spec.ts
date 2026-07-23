import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppModule } from "../src/app.module";
import { buildRoommateDeck } from "../src/roommates/matching";
import { PrismaService } from "../src/prisma/prisma.service";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

const request = require("supertest") as (server: unknown) => any;

describe("roommate matching deck", () => {
  it("expands a small base sample into a large ranked deck with reasons and pagination", () => {
    const response = buildRoommateDeck([
      {
        id: "roommate-1",
        name: "Mia Chen",
        age: 22,
        role: "UCLA MSBA · Fall",
        image: "https://example.com/mia.jpg",
        match: 94,
        budget: "$1,650/月",
        commute: "Westwood / Sawtelle",
        tags: ["早睡", "安静", "爱干净"]
      },
      {
        id: "roommate-2",
        name: "Ethan Liu",
        age: 24,
        role: "USC Intern",
        image: "https://example.com/ethan.jpg",
        match: 88,
        budget: "$2,150/月",
        commute: "USC North / DTLA",
        tags: ["周末社交", "健身"]
      }
    ], {
      limit: 10,
      cursor: 5,
      budgetMin: 1200,
      budgetMax: 1800,
      school: "UCLA",
      hobby: "早睡"
    });

    expect(response.pageInfo).toMatchObject({
      cursor: 5,
      limit: 10,
      returned: 10,
      totalCandidates: 240
    });
    expect(response.discovery.sampleSize).toBe(240);
    expect(response.items[0]).toMatchObject({
      compatibilityScore: expect.any(Number),
      dimensions: {
        profile: expect.any(Number),
        budget: expect.any(Number),
        lifestyle: expect.any(Number),
        school: expect.any(Number),
        area: expect.any(Number),
        reliability: expect.any(Number)
      },
      ranking: expect.objectContaining({
        finalScore: expect.any(Number),
        confidenceScore: expect.any(Number),
        profileQualityScore: expect.any(Number),
        diversityBoost: expect.any(Number),
        explorationBoost: expect.any(Number),
        strategy: expect.stringMatching(/precision|balanced|discovery/)
      }),
      matchType: expect.stringMatching(/top-pick|strong-fit|explore|wildcard/),
      recommendation: expect.objectContaining({
        action: expect.stringMatching(/like|later|pass/),
        confidence: expect.stringMatching(/high|medium|low/),
        headline: expect.any(String),
        nextQuestions: expect.any(Array)
      }),
      decisionHint: expect.any(String),
      rank: 6,
      spark: expect.any(String),
      icebreaker: expect.stringContaining("Ask")
    });
    expect(response.items[0].reasons.length).toBeGreaterThan(0);
    expect(response.items.every((item) => item.badges.length > 0)).toBe(true);
    expect(response.items.every((item, index, items) =>
      index === 0 || items[index - 1].ranking.finalScore >= item.ranking.finalScore
    )).toBe(true);
  });

  it("uses the full school and hobby preference lists when ranking recommendations", () => {
    const response = buildRoommateDeck([
      {
        id: "roommate-1",
        name: "Mia Chen",
        age: 22,
        role: "UCLA MSBA · Fall",
        image: "https://example.com/mia.jpg",
        match: 84,
        budget: "$1,650/月",
        commute: "Westwood / Sawtelle",
        tags: ["早睡", "安静"]
      },
      {
        id: "roommate-2",
        name: "Ava Zhang",
        age: 23,
        role: "USC Viterbi · CS",
        image: "https://example.com/ava.jpg",
        match: 92,
        budget: "$1,580/月",
        commute: "USC North / DTLA",
        tags: ["会做饭", "猫友好", "稳定"]
      }
    ], {
      limit: 1,
      schools: "USC,UCLA",
      hobbies: "会做饭,猫友好",
      school: "",
      hobby: ""
    });

    expect(response.discovery.filters.schools).toEqual(["USC", "UCLA"]);
    expect(response.discovery.filters.hobbies).toEqual(["会做饭", "猫友好"]);
    expect(response.items[0].name).toContain("Ava");
    expect(response.items[0].recommendation.action).toBe("like");
  });

  it("supports a discovery strategy with controlled exploration metadata", () => {
    const response = buildRoommateDeck([
      {
        id: "roommate-1",
        name: "Mia Chen",
        age: 22,
        role: "UCLA MSBA · Fall",
        image: "https://example.com/mia.jpg",
        match: 95,
        budget: "$1,650/月",
        commute: "Westwood / Sawtelle",
        tags: ["早睡", "安静", "爱干净"]
      },
      {
        id: "roommate-2",
        name: "Noah Park",
        age: 24,
        role: "LMU Film · Producer",
        image: "https://example.com/noah.jpg",
        match: 86,
        budget: "$1,720/月",
        commute: "Santa Monica / Culver City",
        tags: ["咖啡党", "接受访客", "整洁"]
      }
    ], {
      limit: 12,
      school: "",
      hobby: "",
      strategy: "discovery"
    });

    expect(response.discovery.filters.strategy).toBe("discovery");
    expect(response.discovery.rankingWeights.exploration).toBeGreaterThan(0);
    expect(response.items.some((item) => item.ranking.explorationBoost > 40)).toBe(true);
    expect(response.items.every((item) => item.ranking.percentile >= 1)).toBe(true);
  });

  it("recommends pass for structurally weak roommate fits", () => {
    const response = buildRoommateDeck([
      {
        id: "roommate-1",
        name: "Mismatch Candidate",
        age: 22,
        role: "Pasadena Freelancer",
        image: "https://example.com/mismatch.jpg",
        match: 51,
        budget: "$2,900/月",
        commute: "Pasadena / Glendale",
        tags: ["周末社交", "接受访客"]
      }
    ], {
      limit: 1,
      budgetMin: 1200,
      budgetMax: 1600,
      schools: "UCLA",
      hobbies: "早睡,安静",
      city: "Westwood",
      strategy: "precision"
    });

    expect(response.items[0].matchType).toBe("wildcard");
    expect(response.items[0].recommendation.action).toBe("pass");
  });

  it("treats empty school and hobby filters as broad discovery", () => {
    const response = buildRoommateDeck([
      {
        id: "roommate-1",
        name: "Mia Chen",
        age: 22,
        role: "UCLA MSBA · Fall",
        image: "https://example.com/mia.jpg",
        match: 94,
        budget: "$1,650/月",
        commute: "Westwood / Sawtelle",
        tags: ["早睡", "安静", "爱干净"]
      }
    ], {
      limit: 5,
      school: "",
      hobby: ""
    });

    expect(response.discovery.filters).toMatchObject({
      school: "",
      hobby: ""
    });
    expect(response.items).toHaveLength(5);
    expect(response.items[0].tradeoffs).not.toContain("Different school/work lane.");
    expect(response.items[0].tradeoffs).not.toContain("Favorite habit not confirmed yet.");
  });
});

describe("roommate deck HTTP endpoint", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = "test-secret";

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideProvider(PrismaService)
      .useValue(createLaunchPrismaMock())
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
      })
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves a paginated Tinder-style deck from seed fallback data", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/roommates/deck?limit=12&cursor=12&budgetMin=1200&budgetMax=1800&school=UCLA&hobby=%E6%97%A9%E7%9D%A1")
      .expect(200)
      .expect(({ body }: { body: Record<string, any> }) => {
        expect(body.pageInfo).toMatchObject({
          cursor: 12,
          limit: 12,
          returned: 12,
          totalCandidates: 240
        });
        expect(body.discovery).toMatchObject({
          sampleSize: 240,
          headline: expect.stringContaining("Scanned 240 roommate profiles"),
          rankingWeights: expect.objectContaining({
            compatibility: expect.any(Number),
            exploration: expect.any(Number)
          })
        });
        expect(body.items[0]).toMatchObject({
          compatibilityScore: expect.any(Number),
          ranking: expect.objectContaining({
            finalScore: expect.any(Number),
            percentile: expect.any(Number)
          }),
          dimensions: expect.objectContaining({
            budget: expect.any(Number),
            lifestyle: expect.any(Number),
            reliability: expect.any(Number)
          }),
          matchType: expect.any(String),
          recommendation: expect.objectContaining({
            action: expect.any(String),
            headline: expect.any(String)
          }),
          decisionHint: expect.any(String),
          reasons: expect.any(Array),
          tradeoffs: expect.any(Array),
          icebreaker: expect.any(String),
          badges: expect.any(Array)
        });
      });
  });
});
