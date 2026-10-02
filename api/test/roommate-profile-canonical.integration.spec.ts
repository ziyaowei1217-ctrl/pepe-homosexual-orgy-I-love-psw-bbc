import { ConflictException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MarketplaceService } from "../src/marketplace/marketplace.service";
import { MAX_DISCOVERABLE_ROOMMATE_PROFILES } from "../src/roommates/discovery-capacity";
import { createDisposablePostgres } from "./support/disposable-postgres";

describe.skipIf(process.env.RUN_DB_SMOKE !== "1")("canonical roommate publication on disposable PostgreSQL", () => {
  const database = createDisposablePostgres("roommate_canonical");
  let observer: PrismaClient;
  let first: PrismaClient;
  let second: PrismaClient;
  let index = 0;

  beforeAll(async () => {
    database.create();
    database.migrateDeploy();
    observer = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    first = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    second = new PrismaClient({ datasources: { db: { url: database.databaseUrl } } });
    await Promise.all([observer.$connect(), first.$connect(), second.$connect()]);
  }, 30_000);

  afterAll(async () => {
    await Promise.allSettled([observer?.$disconnect(), first?.$disconnect(), second?.$disconnect()]);
    database.drop();
  });

  it("serializes concurrent first creates and reuses exactly one current matching row", async () => {
    const fixture = await owner();
    let unlock!: () => void;
    let ready!: () => void;
    const release = new Promise<void>(resolve => { unlock = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const holding = observer.$transaction(async transaction => {
      await transaction.$queryRaw`SELECT "id" FROM "profiles" WHERE "id" = ${fixture.profileId}::uuid FOR NO KEY UPDATE`;
      ready();
      await release;
    });
    await locked;
    const creates = [first, second].map((client, position) => new MarketplaceService(client as never)
      .createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: `Concurrent facts ${position}`, budgetMin: 1000 + position })
      .then(value => ({ value }), error => ({ error })));
    try {
      await waitForLocks(second, "profiles", 2);
    } finally {
      unlock();
      await holding;
    }
    const outcomes = await Promise.all(creates);
    expect(outcomes).toEqual([expect.objectContaining({ value: expect.any(Object) }), expect.objectContaining({ value: expect.any(Object) })]);
    const saved = await observer.roommateMatchingProfile.findMany({ where: { userId: fixture.profileId } });
    expect(saved).toHaveLength(1);
    expect(outcomes.map(outcome => "value" in outcome ? outcome.value.id : null)).toEqual([saved[0].id, saved[0].id]);
    const service = new MarketplaceService(first as never);
    const updates = await Promise.all(Array.from({ length: 12 }, (_, position) =>
      service.createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: `Updated facts ${position}`, budgetMin: 1200 + position })));
    expect(new Set(updates.map(profile => profile.id))).toEqual(new Set([saved[0].id]));
    const current = await observer.roommateMatchingProfile.findUniqueOrThrow({ where: { id: saved[0].id } });
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([expect.objectContaining({ id: current.id, intro: current.intro, budgetMin: current.budgetMin })]);
    expect(await observer.roommateProfile.findUniqueOrThrow({ where: { ownerId: fixture.id } }))
      .toMatchObject({ commute: current.city, budget: `From $${current.budgetMin!.toLocaleString()}/month` });
  });

  it("publishes only the canonical legacy row, rejects stale and foreign IDs and retires older active facts", async () => {
    const fixture = await owner();
    const service = new MarketplaceService(first as never);
    const old = await service.createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: "Old facts" });
    await observer.roommateMatchingProfile.update({ where: { id: old.id }, data: { createdAt: new Date("2000-01-01") } });
    const current = await observer.roommateMatchingProfile.create({ data: {
      userId: fixture.profileId, city: `${fixture.city}-current`, intro: "Current facts", createdAt: new Date("2030-01-01")
    } });
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([]);
    expect(await service.findRoommateProfiles({ city: current.city! })).toEqual([expect.objectContaining({ id: current.id, intro: "Current facts" })]);
    await expect(service.updateRoommateProfile(fixture.id, fixture.email, old.id, { intro: "Reactivated old facts" })).rejects.toBeInstanceOf(ConflictException);
    const outsider = await owner();
    await expect(service.updateRoommateProfile(outsider.id, outsider.email, current.id, { intro: "Forged" })).rejects.toBeInstanceOf(NotFoundException);
    const reused = await service.createRoommateProfile(fixture.id, fixture.email, { age: 27, city: fixture.city, intro: "Final current facts" });
    expect(reused.id).toBe(current.id);
    expect(await observer.roommateMatchingProfile.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ status: "hidden" });
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([expect.objectContaining({ id: current.id, intro: "Final current facts" })]);
    expect(await observer.roommateProfile.findUniqueOrThrow({ where: { ownerId: fixture.id } })).toMatchObject({ age: 27, commute: fixture.city });
    await service.updateRoommateProfile(fixture.id, fixture.email, current.id, { status: "hidden" });
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([]);
    await expect(service.createRoommateProfile(fixture.id, fixture.email, { age: 27, city: fixture.city })).rejects.toBeInstanceOf(ConflictException);
  });

  it.each(["POST", "PATCH"])("holds a moderator archive lock before owner %s visibility checks and never republishes it", async command => {
    const fixture = await owner();
    const service = new MarketplaceService(first as never);
    const profile = await service.createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: "Preserved facts" });
    let unlock!: () => void;
    let ready!: () => void;
    const release = new Promise<void>(resolve => { unlock = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const archiving = observer.$transaction(async transaction => {
      await transaction.roommateProfile.update({ where: { ownerId: fixture.id }, data: { status: "hidden", archivedAt: new Date() } });
      ready();
      await release;
    });
    await locked;
    const creating = (command === "POST"
      ? service.createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: "Must not republish" })
      : service.updateRoommateProfile(fixture.id, fixture.email, profile.id, { intro: "Must not republish", status: "active" }))
      .then(value => ({ value }), error => ({ error }));
    try {
      await waitForLocks(second, "RoommateProfile", 1);
    } finally {
      unlock();
      await archiving;
    }
    expect(await creating).toMatchObject({ error: expect.any(ConflictException) });
    expect(await observer.roommateMatchingProfile.findMany({ where: { userId: fixture.profileId } }))
      .toEqual([expect.objectContaining({ id: profile.id, intro: "Preserved facts" })]);
    expect(await observer.roommateProfile.findUniqueOrThrow({ where: { ownerId: fixture.id } }))
      .toMatchObject({ status: "hidden", archivedAt: expect.any(Date) });
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([]);
  });

  it("lets an owner update commit first, then preserves the moderator archive waiting on that same row", async () => {
    const fixture = await owner();
    const service = new MarketplaceService(first as never);
    const profile = await service.createRoommateProfile(fixture.id, fixture.email, { age: 25, city: fixture.city, intro: "Before update" });
    let unlock!: () => void;
    let ready!: () => void;
    const release = new Promise<void>(resolve => { unlock = resolve; });
    const locked = new Promise<void>(resolve => { ready = resolve; });
    const delayedOwner = new MarketplaceService({
      profile: first.profile,
      $transaction: (operation: (transaction: unknown) => Promise<unknown>) => first.$transaction(async transaction => {
        const delayedMatching = new Proxy(transaction.roommateMatchingProfile, {
          get(target, key) {
            if (key === "update") return async (args: Parameters<typeof target.update>[0]) => {
              // The actual service has already locked the owned card when it
              // reaches this write. Hold that lock to prove the reverse ordering.
              ready();
              await release;
              return target.update(args);
            };
            return Reflect.get(target, key);
          }
        });
        return operation(new Proxy(transaction, {
          get(target, key) {
            return key === "roommateMatchingProfile" ? delayedMatching : Reflect.get(target, key);
          }
        }));
      })
    } as never);
    const updating = delayedOwner.updateRoommateProfile(fixture.id, fixture.email, profile.id, { intro: "Committed owner facts" });
    await locked;
    const archiving = observer.roommateProfile.update({ where: { ownerId: fixture.id }, data: { status: "hidden", archivedAt: new Date() } })
      .then(value => value);
    try {
      await waitForLocks(second, "RoommateProfile", 1);
    } finally {
      unlock();
      await updating;
    }
    await archiving;
    expect(await observer.roommateMatchingProfile.findUniqueOrThrow({ where: { id: profile.id } }))
      .toMatchObject({ intro: "Committed owner facts" });
    expect(await observer.roommateProfile.findUniqueOrThrow({ where: { ownerId: fixture.id } }))
      .toMatchObject({ status: "hidden", archivedAt: expect.any(Date) });
    await expect(service.updateRoommateProfile(fixture.id, fixture.email, profile.id, { status: "active" })).rejects.toBeInstanceOf(ConflictException);
    expect(await service.findRoommateProfiles({ city: fixture.city })).toEqual([]);
  });

  it("returns explicit capacity failure for 5,001 eligible owners and returns all 5,000 when below the limit", async () => {
    const city = "Capacity regression city";
    const accounts = Array.from({ length: MAX_DISCOVERABLE_ROOMMATE_PROFILES + 1 }, (_, position) => ({
      id: `capacity-owner-${position}`, email: `capacity-owner-${position}@example.test`, profileId: randomUUID()
    }));
    await observer.user.createMany({ data: accounts.map(({ id, email }) => ({ id, email })) });
    await observer.profile.createMany({ data: accounts.map(({ profileId, email }) => ({ id: profileId, email })) });
    await observer.roommateMatchingProfile.createMany({ data: accounts.map(({ profileId }) => ({ userId: profileId, city })) });
    await observer.roommateProfile.createMany({ data: accounts.map(({ id }) => ({
      ownerId: id, name: "Capacity member", age: 25, role: "renter", image: "https://example.test/avatar.png",
      match: 0, budget: "Flexible", commute: city, tags: []
    })) });
    const service = new MarketplaceService(first as never);
    await expect(service.findRoommateProfiles({ city })).rejects.toBeInstanceOf(ServiceUnavailableException);
    await observer.roommateProfile.update({ where: { ownerId: accounts[0].id }, data: { status: "hidden", archivedAt: new Date() } });
    const profiles = await service.findRoommateProfiles({ city });
    expect(profiles).toHaveLength(MAX_DISCOVERABLE_ROOMMATE_PROFILES);
    expect(new Set(profiles.map(profile => profile.userId)).size).toBe(MAX_DISCOVERABLE_ROOMMATE_PROFILES);
  }, 20_000);

  async function owner() {
    const id = `canonical-owner-${++index}`;
    const email = `${id}@example.test`;
    await observer.user.create({ data: { id, email } });
    const profile = await observer.profile.create({ data: { id: randomUUID(), email } });
    return { id, email, profileId: profile.id, city: `Unique city ${index}` };
  }

  async function waitForLocks(client: PrismaClient, table: string, count: number) {
    const deadline = Date.now() + 2_000;
    while (Date.now() < deadline) {
      const [{ waiting }] = await client.$queryRaw<Array<{ waiting: bigint }>>`
        SELECT count(*) AS waiting FROM pg_stat_activity WHERE datname = current_database()
          AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE ${`%${table}%`}
      `;
      if (Number(waiting) >= count) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Expected ${count} writes to wait for the ${table} lock`);
  }
});
