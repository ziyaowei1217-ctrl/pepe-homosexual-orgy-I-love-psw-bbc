import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../src/prisma/prisma.service";
import { UserDocumentsService } from "../src/user-documents/user-documents.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

const database = createDisposablePostgres("user_documents");

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("account documents on PostgreSQL", () => {
  let prisma: PrismaService;
  let documents: UserDocumentsService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("DATABASE_URL", database.databaseUrl);
    prisma = new PrismaService(); await prisma.$connect();
    documents = new UserDocumentsService(prisma);
  }, 30_000);
  afterAll(async () => { await prisma?.$disconnect(); vi.unstubAllEnvs(); database.drop(); });

  it("lets exactly one of several writes based on the same revision through", async () => {
    const user = await prisma.user.create({ data: { email: "documents@example.test" } });
    const first = await Promise.allSettled(Array.from({ length: 6 }, (_, index) =>
      documents.put(user.id, "feed-signals", { viewedIds: [`first-${index}`], lastSearch: "" }, 0)));
    expect(first.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(first.filter((result) => result.status === "rejected").every((result) => (result as PromiseRejectedResult).reason.status === 409)).toBe(true);

    const next = await Promise.allSettled(Array.from({ length: 6 }, (_, index) =>
      documents.put(user.id, "feed-signals", { viewedIds: [`next-${index}`], lastSearch: "" }, 1)));
    expect(next.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const stored = await documents.list(user.id);
    expect(stored["feed-signals"]?.revision).toBe(2);
  });

  it("enforces positive revisions and object values, and deletes documents with the account", async () => {
    const user = await prisma.user.create({ data: { email: "documents-delete@example.test" } });
    await documents.put(user.id, "renter-preferences", { destination: "UCLA", budgetMax: 1800 }, 0);
    await expect(prisma.$executeRawUnsafe(`UPDATE "UserDocument" SET "revision" = 0 WHERE "userId" = '${user.id}'`)).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe(`UPDATE "UserDocument" SET "value" = '[]'::jsonb WHERE "userId" = '${user.id}'`)).rejects.toThrow();
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.userDocument.count({ where: { userId: user.id } })).toBe(0);
  });
});
