import "reflect-metadata";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { MarketplaceService } from "../src/marketplace/marketplace.service";
import { createDisposablePostgres } from "./support/disposable-postgres";

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("roommate merged ranges on disposable PostgreSQL", () => {
  const database = createDisposablePostgres("round5_roommate_ranges");
  let prisma: PrismaClient;
  let service: MarketplaceService;
  beforeAll(async () => {
    database.create(); database.migrateDeploy();
    prisma = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    service = new MarketplaceService(prisma as never);
    await prisma.user.create({ data: { id: "owner", email: "owner@ranges.example" } });
  }, 30000);
  afterAll(async () => { await prisma?.$disconnect(); database.drop(); });
  const input = { age: 25, budgetMin: 1000, budgetMax: 2000, moveInDate: "2099-06-01", moveOutDate: "2099-09-01" };
  const create = () => service.createRoommateProfile("owner", "owner@ranges.example", input);
  it.each([{ budgetMin: 2100 }, { budgetMax: 900 }])("rejects inverted budget from a one-sided update %j", async patch => {
    const profile = await create();
    await expect(service.updateRoommateProfile("owner", "owner@ranges.example", profile.id, patch)).rejects.toMatchObject({ status: 400 });
    expect(await prisma.roommateMatchingProfile.findUnique({ where: { id: profile.id } })).toMatchObject({ budgetMin: 1000, budgetMax: 2000 });
  });
  it("serializes conflicting partial budgets so only one can succeed", async () => {
    const profile = await create();
    const outcomes = await Promise.allSettled([
      service.updateRoommateProfile("owner", "owner@ranges.example", profile.id, { budgetMin: 1900 }),
      service.updateRoommateProfile("owner", "owner@ranges.example", profile.id, { budgetMax: 1100 })
    ]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter(item => item.status === "rejected")).toMatchObject([{ reason: { status: 400 } }]);
    const saved = await prisma.roommateMatchingProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(saved.budgetMin!).toBeLessThanOrEqual(saved.budgetMax!);
    expect(await prisma.roommateProfile.findUnique({ where: { ownerId: "owner" } })).toMatchObject({ budget: `$${saved.budgetMin!.toLocaleString()}–$${saved.budgetMax!.toLocaleString()}/month` });
  });
  it("rejects inverted dates at create", async () => {
    await expect(service.createRoommateProfile("owner", "owner@ranges.example", { ...input, moveOutDate: "2099-05-01" })).rejects.toMatchObject({ status: 400 });
  });
  it.each([{ moveInDate: "2099-10-01" }, { moveOutDate: "2099-05-01" }])("rejects inverted dates from partial updates %j", async patch => {
    const profile = await create();
    await expect(service.updateRoommateProfile("owner", "owner@ranges.example", profile.id, patch)).rejects.toMatchObject({ status: 400 });
  });
  it("allows unset bounds and equal dates while preserving ownership", async () => {
    const profile = await service.createRoommateProfile("owner", "owner@ranges.example", { age: 25, budgetMin: 0 });
    const saved = await service.updateRoommateProfile("owner", "owner@ranges.example", profile.id, { budgetMax: 0, moveInDate: "2099-06-01", moveOutDate: "2099-06-01" });
    expect(saved).toMatchObject({ budgetMin: 0, budgetMax: 0 });
    await expect(service.updateRoommateProfile("other", "other@ranges.example", profile.id, { budgetMax: 500 })).rejects.toMatchObject({ status: 404 });
  });
});
