import "reflect-metadata";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { Prisma, UserDocumentKind } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AuthGuard } from "../src/auth/auth.guard";
import { AuthenticatedUserService } from "../src/auth/authenticated-user.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { normalizeUserDocument, SAVED_COLLECTION_LIMITS, UserDocumentTooLargeError } from "../src/user-documents/user-document-values";
import { UserDocumentWriteLimiter } from "../src/user-documents/user-document-write-limiter";
import { UserDocumentsController } from "../src/user-documents/user-documents.controller";
import { UserDocumentsService } from "../src/user-documents/user-documents.service";

const request = require("supertest") as (server: unknown) => any;

type Row = { userId: string; kind: UserDocumentKind; revision: number; value: unknown; createdAt: Date; updatedAt: Date };

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError(`fixture ${code}`, { code, clientVersion: "test" });
}

function memoryDocuments() {
  const rows = new Map<string, Row>();
  const key = (userId: string, kind: UserDocumentKind) => `${userId}:${kind}`;
  return {
    rows,
    userDocument: {
      findMany: async ({ where }: { where: { userId: string } }) => [...rows.values()].filter((row) => row.userId === where.userId),
      create: async ({ data }: { data: Omit<Row, "createdAt" | "updatedAt"> }) => {
        if (rows.has(key(data.userId, data.kind))) throw knownError("P2002");
        const row = { ...data, createdAt: new Date(), updatedAt: new Date() };
        rows.set(key(data.userId, data.kind), row);
        return row;
      },
      update: async ({ where, data }: { where: { userId_kind: { userId: string; kind: UserDocumentKind }; revision: number }; data: { value: unknown; revision: number } }) => {
        const existing = rows.get(key(where.userId_kind.userId, where.userId_kind.kind));
        if (!existing || existing.revision !== where.revision) throw knownError("P2025");
        const row = { ...existing, ...data, updatedAt: new Date() };
        rows.set(key(existing.userId, existing.kind), row);
        return row;
      }
    },
    user: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id.startsWith("user-") ? { id: where.id, email: `${where.id}@example.com`, role: "USER" } : null
    }
  };
}

describe("account documents", () => {
  let app: INestApplication;
  let jwt: JwtService;
  let database: ReturnType<typeof memoryDocuments>;

  async function start(limiter = new UserDocumentWriteLimiter()) {
    database = memoryDocuments();
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: "test-secret" })],
      controllers: [UserDocumentsController],
      providers: [
        AuthGuard,
        AuthenticatedUserService,
        UserDocumentsService,
        { provide: UserDocumentWriteLimiter, useValue: limiter },
        { provide: PrismaService, useValue: database }
      ]
    }).compile();
    jwt = moduleRef.get(JwtService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }

  const bearer = async (userId: string) => `Bearer ${await jwt.signAsync({ sub: userId, email: `${userId}@example.com`, role: "USER" })}`;
  const saved = { version: 1, collections: [{ id: "all", name: "全部收藏", listingIds: ["listing-1"] }], notes: { "listing-1": "近学校" } };

  beforeEach(() => start());
  afterEach(() => app.close());

  it("requires a session", async () => {
    await request(app.getHttpServer()).get("/api/v1/me/documents").expect(401);
    await request(app.getHttpServer()).put("/api/v1/me/documents/saved-collections").send({ value: saved, baseRevision: 0 }).expect(401);
  });

  it("creates, reads and updates a document by revision", async () => {
    const http = request(app.getHttpServer());
    const auth = await bearer("user-1");
    const empty = await http.get("/api/v1/me/documents").set("Authorization", auth).expect(200);
    expect(empty.body).toEqual({ "saved-collections": null, "renter-preferences": null, "feed-signals": null });
    expect(empty.headers["cache-control"]).toBe("no-store");

    const created = await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: saved, baseRevision: 0 }).expect(200);
    expect(created.body).toMatchObject({ revision: 1, value: saved });

    const next = { ...saved, collections: [{ id: "all", name: "全部收藏", listingIds: ["listing-1", "listing-2"] }] };
    const updated = await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: next, baseRevision: 1 }).expect(200);
    expect(updated.body).toMatchObject({ revision: 2, value: next });

    const listed = await http.get("/api/v1/me/documents").set("Authorization", auth).expect(200);
    expect(listed.body["saved-collections"]).toMatchObject({ revision: 2, value: next });
    expect(listed.body["renter-preferences"]).toBeNull();
  });

  it("rejects a write based on an old revision, or a second first write, with DOCUMENT_CONFLICT", async () => {
    const http = request(app.getHttpServer());
    const auth = await bearer("user-1");
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: { viewedIds: ["a"], lastSearch: "" }, baseRevision: 0 }).expect(200);
    const again = await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: { viewedIds: ["b"], lastSearch: "" }, baseRevision: 0 }).expect(409);
    expect(again.body.code).toBe("DOCUMENT_CONFLICT");
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: { viewedIds: ["b", "a"], lastSearch: "" }, baseRevision: 1 }).expect(200);
    const stale = await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: { viewedIds: ["c"], lastSearch: "" }, baseRevision: 1 }).expect(409);
    expect(stale.body.code).toBe("DOCUMENT_CONFLICT");
    const missing = await http.put("/api/v1/me/documents/renter-preferences").set("Authorization", auth).send({ value: {}, baseRevision: 3 }).expect(409);
    expect(missing.body.code).toBe("DOCUMENT_CONFLICT");
  });

  it("keeps each account's documents separate", async () => {
    const http = request(app.getHttpServer());
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", await bearer("user-1")).send({ value: saved, baseRevision: 0 }).expect(200);
    const other = await http.get("/api/v1/me/documents").set("Authorization", await bearer("user-2")).expect(200);
    expect(other.body["saved-collections"]).toBeNull();
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", await bearer("user-2")).send({ value: saved, baseRevision: 0 }).expect(200);
  });

  it("validates the request and the document kind", async () => {
    const http = request(app.getHttpServer());
    const auth = await bearer("user-1");
    await http.put("/api/v1/me/documents/passwords").set("Authorization", auth).send({ value: {}, baseRevision: 0 }).expect(404);
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: "text", baseRevision: 0 }).expect(400);
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: {}, baseRevision: -1 }).expect(400);
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: {}, baseRevision: 0, userId: "user-2" }).expect(400);
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: {} }).expect(400);
  });

  it("refuses a document over 64 KB after normalizing it", async () => {
    const auth = await bearer("user-1");
    // About 76 KB: under the 100 KB request limit, over the 64 KB document limit.
    const notes = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`listing-${index}`, "n".repeat(1900)]));
    const response = await request(app.getHttpServer())
      .put("/api/v1/me/documents/saved-collections").set("Authorization", auth)
      .send({ value: { version: 1, collections: [], notes }, baseRevision: 0 }).expect(413);
    expect(response.body.code).toBe("DOCUMENT_TOO_LARGE");
    expect(database.rows.size).toBe(0);
  });

  it("refuses saved lists over their item limits instead of cutting them", async () => {
    const auth = await bearer("user-1");
    const listingIds = Array.from({ length: SAVED_COLLECTION_LIMITS.listingsPerCollection + 1 }, (_, index) => `listing-${index}`);
    const response = await request(app.getHttpServer())
      .put("/api/v1/me/documents/saved-collections").set("Authorization", auth)
      .send({ value: { version: 1, collections: [{ id: "all", name: "全部收藏", listingIds }], notes: {} }, baseRevision: 0 }).expect(413);
    expect(response.body.code).toBe("DOCUMENT_TOO_LARGE");
    expect(database.rows.size).toBe(0);
  });

  it("limits writes per account and says when to retry", async () => {
    await app.close();
    let now = 0;
    await start(new UserDocumentWriteLimiter(2, 60_000, () => now));
    const http = request(app.getHttpServer());
    const auth = await bearer("user-1");
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: {}, baseRevision: 0 }).expect(200);
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: {}, baseRevision: 1 }).expect(200);
    const limited = await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: {}, baseRevision: 2 }).expect(429);
    expect(limited.body.code).toBe("DOCUMENT_RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBe("60");
    // Each kind has its own budget: busy feed signals do not hold back saves.
    await http.put("/api/v1/me/documents/saved-collections").set("Authorization", auth).send({ value: saved, baseRevision: 0 }).expect(200);
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", await bearer("user-2")).send({ value: {}, baseRevision: 0 }).expect(200);
    now = 60_000;
    await http.put("/api/v1/me/documents/feed-signals").set("Authorization", auth).send({ value: {}, baseRevision: 2 }).expect(200);
  });
});

describe("account document values", () => {
  it("keeps saved lists to a bounded shape", () => {
    const value = normalizeUserDocument(UserDocumentKind.SAVED_COLLECTIONS, {
      version: 7,
      collections: [
        { id: "all", name: " 全部收藏 ", listingIds: ["a", "a", "", 3, " b "] },
        { id: "all", name: "duplicate", listingIds: ["c"] },
        { id: "", name: "no id", listingIds: [] },
        { id: "trip", name: "x".repeat(80), listingIds: "a" }
      ],
      notes: { a: " 近地铁 ", b: "", c: 5 },
      extra: true
    });
    expect(value).toEqual({
      version: 1,
      collections: [
        { id: "all", name: "全部收藏", listingIds: ["a", "b"] },
        { id: "trip", name: "x".repeat(60), listingIds: [] }
      ],
      notes: { a: "近地铁" }
    });
  });

  it("refuses saved lists past each limit rather than dropping saves or notes", () => {
    const list = (count: number) => Array.from({ length: count }, (_, index) => `listing-${index}`);
    const saved = (value: Record<string, unknown>) => () => normalizeUserDocument(UserDocumentKind.SAVED_COLLECTIONS, { version: 1, collections: [], notes: {}, ...value });
    const atLimit = saved({
      collections: Array.from({ length: SAVED_COLLECTION_LIMITS.collections }, (_, index) => ({ id: `list-${index}`, name: `清单 ${index}`, listingIds: index === 0 ? list(SAVED_COLLECTION_LIMITS.listingsPerCollection) : [] })),
      notes: Object.fromEntries(list(SAVED_COLLECTION_LIMITS.notes).map((id, index) => [id, index === 0 ? "备".repeat(SAVED_COLLECTION_LIMITS.noteLength) : "近地铁"]))
    });
    expect(atLimit).not.toThrow();
    expect(saved({ collections: Array.from({ length: SAVED_COLLECTION_LIMITS.collections + 1 }, (_, index) => ({ id: `list-${index}`, name: "清单", listingIds: [] })) })).toThrow(UserDocumentTooLargeError);
    expect(saved({ collections: [{ id: "all", name: "全部收藏", listingIds: list(SAVED_COLLECTION_LIMITS.listingsPerCollection + 1) }] })).toThrow(UserDocumentTooLargeError);
    expect(saved({ notes: Object.fromEntries(list(SAVED_COLLECTION_LIMITS.notes + 1).map((id) => [id, "近地铁"])) })).toThrow(UserDocumentTooLargeError);
    expect(saved({ notes: { "listing-1": "备".repeat(SAVED_COLLECTION_LIMITS.noteLength + 1) } })).toThrow(UserDocumentTooLargeError);
  });

  it("stores only text Postgres accepts as JSON, and cuts without splitting an emoji", () => {
    const value = normalizeUserDocument(UserDocumentKind.SAVED_COLLECTIONS, {
      version: 1,
      collections: [{ id: "all", name: `${"x".repeat(59)}😀`, listingIds: ["a\u0000"] }],
      notes: { a: "近\u0000地铁 \ud83d", "b\udc00": "ok" }
    });
    expect(value).toEqual({ version: 1, collections: [{ id: "all", name: "x".repeat(59), listingIds: ["a"] }], notes: { a: "近地铁 \uFFFD", "b\uFFFD": "ok" } });
    expect(normalizeUserDocument(UserDocumentKind.RENTER_PREFERENCES, { destination: `${"y".repeat(79)}😀` })).toMatchObject({ destination: "y".repeat(79) });
    expect(normalizeUserDocument(UserDocumentKind.FEED_SIGNALS, { viewedIds: [], lastSearch: "/search?q=\ud800" })).toEqual({ viewedIds: [], lastSearch: "/search?q=\uFFFD" });
    expect(JSON.stringify(value)).not.toMatch(/\\u0000|\\ud[89a-f]/i);
  });

  it("keeps preferences and feed signals to what the web app reads", () => {
    expect(normalizeUserDocument(UserDocumentKind.RENTER_PREFERENCES, {
      destination: " UCLA ", budgetMax: 1800.4, moveIn: "2027-01-05", moveOut: "2026-12-01", beds: -2, mustHave: ["独卫", "独卫", 4]
    })).toEqual({ destination: "UCLA", budgetMax: 1800, moveIn: "2027-01-05", moveOut: "", beds: 0, mustHave: ["独卫"] });
    expect(normalizeUserDocument(UserDocumentKind.RENTER_PREFERENCES, { moveIn: "soon", moveOut: "2027-02-01" }))
      .toMatchObject({ moveIn: "", moveOut: "" });
    expect(normalizeUserDocument(UserDocumentKind.FEED_SIGNALS, {
      viewedIds: Array.from({ length: 40 }, (_, index) => `listing-${index}`), lastSearch: "https://example.com/search?q=x"
    })).toEqual({ viewedIds: Array.from({ length: 30 }, (_, index) => `listing-${index}`), lastSearch: "" });
    expect(normalizeUserDocument(UserDocumentKind.FEED_SIGNALS, { viewedIds: ["a"], lastSearch: "/search?q=UCLA" }))
      .toEqual({ viewedIds: ["a"], lastSearch: "/search?q=UCLA" });
  });
});
