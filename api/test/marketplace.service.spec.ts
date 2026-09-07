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
