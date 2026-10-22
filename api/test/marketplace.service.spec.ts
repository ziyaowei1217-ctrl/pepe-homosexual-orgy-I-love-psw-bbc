import { describe, expect, it } from "vitest";

import { MarketplaceService } from "../src/marketplace/marketplace.service";

describe("MarketplaceService", () => {
  it("rolls back a matching-profile create when its owned public-card projection fails", async () => {
    const database = createTransactionalDatabase();
    const service = new MarketplaceService(database.prisma as never);

    await expect(service.createRoommateProfile("user-1", "owner@example.com", roommateProfileInput())).rejects.toThrow(
      "public-card write failed"
    );

    expect(database.matchingProfiles).toEqual([]);
    expect(database.transactions).toBe(1);
  });

  it("rolls back a matching-profile update when its owned public-card projection fails", async () => {
    const database = createTransactionalDatabase({ withExistingMatchingProfile: true });
    const service = new MarketplaceService(database.prisma as never);

    await expect(service.updateRoommateProfile("user-1", "owner@example.com", "matching-1", { city: "SF" })).rejects.toThrow(
      "public-card write failed"
    );

    expect(database.matchingProfiles).toEqual([expect.objectContaining({ id: "matching-1", city: "LA", status: "active" })]);
    expect(database.transactions).toBe(1);
  });

  it("projects the public card from the matching row it just wrote, without the email prefix", async () => {
    const upserts: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
    const transaction = {
      roommateMatchingProfile: {
        create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "matching-9", ...data, status: "active" })
      },
      roommateProfile: {
        findUnique: async () => null,
        upsert: async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) => upserts.push(args)
      }
    };
    const prisma = {
      profile: { upsert: async () => ({ id: "profile-1", email: "maya.private@example.com", displayName: null, avatarUrl: null, city: null, school: null }) },
      $transaction: async <T>(operation: (client: typeof transaction) => Promise<T>) => operation(transaction)
    };
    const service = new MarketplaceService(prisma as never);

    await service.createRoommateProfile("user-1", "maya.private@example.com", {
      ...roommateProfileInput(),
      pets: "none",
      guests: "often",
      smoking: "free text"
    });

    expect(upserts[0]!.create).toMatchObject({
      ownerId: "user-1",
      name: "室友",
      role: "USC",
      age: 26,
      budget: "$1,200–$1,800/month",
      matchingProfileId: "matching-9",
      tags: ["夜猫子", "整洁", "经常带朋友", "没有宠物", "独立卧室"]
    });
    expect(JSON.stringify(upserts)).not.toContain("maya.private");
  });
});

function roommateProfileInput() {
  return {
    age: 26,
    school: "USC",
    city: "LA",
    budgetMin: 1200,
    budgetMax: 1800,
    roomType: "private_room",
    cleanliness: "tidy",
    sleepSchedule: "night_owl",
    pets: "ok"
  };
}

function createTransactionalDatabase({ withExistingMatchingProfile = false } = {}) {
  const matchingProfiles: Array<Record<string, unknown>> = withExistingMatchingProfile
    ? [matchingProfileRecord({ id: "matching-1", userId: "profile-1", city: "LA", status: "active" })]
    : [];
  let transactions = 0;
  const profile = {
    id: "profile-1",
    email: "owner@example.com",
    displayName: "Owner",
    avatarUrl: null,
    role: "renter",
    city: "LA",
    school: "USC"
  };
  const prisma = {
    profile: {
      upsert: async () => profile
    },
    roommateMatchingProfile: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const created = { id: `matching-${matchingProfiles.length + 1}`, ...data, status: "active" };
        matchingProfiles.push(created);
        return created;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
        matchingProfiles.find((item) => item.id === where.id && item.userId === where.userId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const matchingProfile = matchingProfiles.find((item) => item.id === where.id);
        if (!matchingProfile) throw new Error("matching profile not found");
        Object.assign(matchingProfile, data);
        return matchingProfile;
      }
    },
    roommateProfile: {
      findUnique: async () => (withExistingMatchingProfile ? { ownerId: "user-1", age: 26 } : null),
      upsert: async () => {
        throw new Error("public-card write failed");
      }
    },
    $transaction: async <T>(operation: (transaction: any) => Promise<T>) => {
      transactions += 1;
      const pendingProfiles = matchingProfiles.map((matchingProfile) => ({ ...matchingProfile }));
      const transaction = {
        $queryRaw: async () => [],
        profile: prisma.profile,
        roommateMatchingProfile: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const created = {
              id: `matching-${pendingProfiles.length + 1}`,
              ...data,
              status: "active"
            };
            pendingProfiles.push(created);
            return created;
          },
          findFirst: async ({ where }: { where: { id: string; userId: string } }) =>
            pendingProfiles.find((item) => item.id === where.id && item.userId === where.userId) ?? null,
          update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const matchingProfile = pendingProfiles.find((item) => item.id === where.id);
            if (!matchingProfile) throw new Error("matching profile not found");
            Object.assign(matchingProfile, data);
            return matchingProfile;
          }
        },
        roommateProfile: {
          ...prisma.roommateProfile,
          findUnique: prisma.roommateProfile.findUnique
        }
      };

      try {
        const result = await operation(transaction);
        matchingProfiles.splice(0, matchingProfiles.length, ...pendingProfiles);
        return result;
      } catch (error) {
        throw error;
      }
    }
  };

  return {
    prisma,
    matchingProfiles,
    get transactions() {
      return transactions;
    }
  };
}

function matchingProfileRecord(overrides: Record<string, unknown>) {
  return {
    id: "matching-1",
    userId: "profile-1",
    school: null,
    city: null,
    budgetMin: null,
    budgetMax: null,
    roomType: null,
    cleanliness: null,
    sleepSchedule: null,
    pets: null,
    status: "active",
    ...overrides
  };
}
