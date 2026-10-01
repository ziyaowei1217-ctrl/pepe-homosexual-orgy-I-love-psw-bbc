import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import { MarketplaceService } from "../src/marketplace/marketplace.service";
import { MAX_DISCOVERABLE_ROOMMATE_PROFILES } from "../src/roommates/discovery-capacity";
import { createLaunchPrismaMock } from "./support/launch-prisma-mock";

async function fixture() {
  const prisma = createLaunchPrismaMock();
  const email = "canonical@example.test";
  const owner = await prisma.user.upsert({ where: { email }, create: { email } });
  const service = new MarketplaceService(prisma as never);
  const create = (data = {}) => service.createRoommateProfile(owner.id, email, { age: 25, city: "Current city", school: "Current school", ...data });
  return { prisma, service, email, owner, create };
}

describe("canonical roommate publication", () => {
  it("reuses one matching row and publishes only updated facts on repeat creation", async () => {
    const { prisma, service, create, owner } = await fixture();
    const first = await create({ city: "Old city", intro: "Old facts" });
    const current = await create({ intro: "Current facts", budgetMin: 1234 });
    expect(current.id).toBe(first.id);
    expect(await prisma.roommateMatchingProfile.findMany()).toHaveLength(1);
    expect(await service.findRoommateProfiles({ city: "Old city" })).toEqual([]);
    expect(await service.findRoommateProfiles({})).toEqual([expect.objectContaining({ id: first.id, city: "Current city", intro: "Current facts" })]);
    expect(await prisma.roommateProfile.findUnique({ where: { ownerId: owner.id } })).toMatchObject({ commute: "Current city", budget: "From $1,234/month" });
  });

  it("selects the newest creation before public filters, retires old rows on write and rejects stale IDs", async () => {
    const { prisma, service, create, owner, email } = await fixture();
    const old = await create({ city: "Old city", intro: "Old facts" });
    const newer = await prisma.roommateMatchingProfile.create({ data: {
      userId: old.userId, city: "Current city", intro: "Current facts", createdAt: new Date(old.createdAt.getTime() + 1000)
    } });
    expect(await service.findRoommateProfiles({ city: "Old city" })).toEqual([]);
    expect(await service.findRoommateProfiles({})).toEqual([expect.objectContaining({ id: newer.id })]);
    await expect(service.updateRoommateProfile(owner.id, email, old.id, { status: "active" })).rejects.toBeInstanceOf(ConflictException);
    const reused = await create({ intro: "Final facts" });
    expect(reused.id).toBe(newer.id);
    expect(await prisma.roommateMatchingProfile.findMany({ where: { status: "active" } })).toHaveLength(1);
    expect(await prisma.roommateMatchingProfile.findFirst({ where: { id: old.id } })).toMatchObject({ status: "hidden" });
    await expect(service.updateRoommateProfile("outsider", "other@example.test", newer.id, { intro: "Forged" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("never falls back to older active facts when the canonical row is hidden", async () => {
    const { prisma, service, create } = await fixture();
    const old = await create({ intro: "Old private facts" });
    await prisma.roommateMatchingProfile.create({ data: {
      userId: old.userId, status: "hidden", createdAt: new Date(old.createdAt.getTime() + 1000)
    } });
    expect(await service.findRoommateProfiles({})).toEqual([]);
    await expect(create()).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([
    { status: "hidden", archivedAt: new Date() },
    { status: "matched", archivedAt: new Date() },
    { status: "active", archivedAt: new Date() }
  ])("repeat POST cannot silently undo opted-out or moderator visibility: %o", async visibility => {
    const { prisma, service, create, owner } = await fixture();
    const original = await create({ intro: "Preserved facts" });
    const owned = await prisma.roommateProfile.findUnique({ where: { ownerId: owner.id } });
    await prisma.roommateProfile.update({ where: { id: owned!.id }, data: visibility });
    await expect(create({ intro: "Republished facts" })).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.roommateMatchingProfile.findMany()).toEqual([expect.objectContaining({ id: original.id, intro: "Preserved facts" })]);
    expect(await service.findRoommateProfiles({})).toEqual([]);
  });

  it("checks merged ranges on a repeated create before overwriting current facts", async () => {
    const { prisma, service, create, owner, email } = await fixture();
    const first = await create({ budgetMin: 1000, budgetMax: 2000 });
    await expect(create({ budgetMin: 3000 })).rejects.toMatchObject({ status: 400 });
    await expect(service.updateRoommateProfile(owner.id, email, first.id, { budgetMax: 500 })).rejects.toMatchObject({ status: 400 });
    expect(await prisma.roommateMatchingProfile.findMany()).toEqual([expect.objectContaining({ budgetMin: 1000, budgetMax: 2000 })]);
  });

  it("bounds the parameterized raw query and explicitly rejects overflow without truncating supported catalogs", async () => {
    const queryRaw = vi.fn(async (_query: unknown) => Array.from({ length: MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1 }, () => ({})));
    const service = new MarketplaceService({ $queryRaw: queryRaw } as never);
    await expect(service.findRoommateProfiles({ city: "x' OR 1=1--" })).rejects.toBeInstanceOf(ServiceUnavailableException);
    const sql = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain("LIMIT ?");
    expect(sql.sql).not.toContain("x' OR");
    expect(sql.values.at(-1)).toBe(MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1);
    queryRaw.mockResolvedValueOnce(Array.from({ length: MAX_DISCOVERABLE_ROOMMATE_PROFILES }, () => ({})));
    expect(await service.findRoommateProfiles({})).toHaveLength(MAX_DISCOVERABLE_ROOMMATE_PROFILES);
  });
});
