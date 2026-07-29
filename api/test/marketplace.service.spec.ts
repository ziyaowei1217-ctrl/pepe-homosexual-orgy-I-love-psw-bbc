import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { MarketplaceService } from "../src/marketplace/marketplace.service";

type ProfileRecord = {
  id: string;
  email: string;
  displayName: string | null;
  school: string | null;
  city: string | null;
  role: string;
};

describe("MarketplaceService housing-listing publish gate", () => {
  it.each([
    ["an incomplete profile", { school: " " }],
    ["a complete renter profile", { role: "renter" }]
  ])("blocks housing-listing creation for %s without creating a placeholder profile", async (_label, overrides) => {
    const prisma = createPrismaMock({
      profiles: [profileRecord(overrides)]
    });
    const service = new MarketplaceService(prisma as never);

    await expect(service.createHousingListing("owner@example.com", housingListingDto())).rejects.toThrow(
      ForbiddenException
    );
    expect(prisma.profile.upsertCalls).toHaveLength(0);
    expect(prisma.housingListing.createCalls).toHaveLength(0);
  });

  it.each(["lister", "both"] as const)("allows a complete %s profile to create a housing listing", async (role) => {
    const prisma = createPrismaMock({
      profiles: [profileRecord({ role })]
    });
    const service = new MarketplaceService(prisma as never);

    await expect(service.createHousingListing("owner@example.com", housingListingDto())).resolves.toMatchObject({
      ownerId: "profile-1",
      status: "draft"
    });
  });

  it.each([
    ["an incomplete profile", { city: null }],
    ["a complete renter profile", { role: "renter" }]
  ])("blocks housing-listing updates for %s", async (_label, overrides) => {
    const prisma = createPrismaMock({
      profiles: [profileRecord(overrides)],
      listings: [{ id: "listing-1", ownerId: "profile-1", status: "draft" }]
    });
    const service = new MarketplaceService(prisma as never);

    await expect(
      service.updateHousingListing("owner@example.com", "listing-1", { status: "active" })
    ).rejects.toThrow(ForbiddenException);
    expect(prisma.housingListing.updateCalls).toHaveLength(0);
  });

  it("keeps ownership checks intact for complete publishers", async () => {
    const prisma = createPrismaMock({
      profiles: [profileRecord()],
      listings: [{ id: "listing-1", ownerId: "profile-2", status: "draft" }]
    });
    const service = new MarketplaceService(prisma as never);

    await expect(
      service.updateHousingListing("owner@example.com", "listing-1", { status: "active" })
    ).rejects.toThrow(NotFoundException);
  });
});

function profileRecord(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: "profile-1",
    email: "owner@example.com",
    displayName: "Maya Chen",
    school: "UCLA",
    city: "Los Angeles",
    role: "lister",
    ...overrides
  };
}

function housingListingDto() {
  return {
    title: "UCLA private room",
    listingType: "sublet",
    propertyType: "apartment",
    roomType: "private_room",
    priceMonthly: 1650,
    city: "Los Angeles",
    moveInDate: "2026-08-15",
    bedrooms: 2,
    bathrooms: 1
  };
}

function createPrismaMock({
  profiles = [],
  listings = []
}: {
  profiles?: ProfileRecord[];
  listings?: Array<{ id: string; ownerId: string; status: string }>;
}) {
  const profileRecords = profiles.map((profile) => ({ ...profile }));
  const listingRecords = listings.map((listing) => ({ ...listing }));
  const mock = {
    profile: {
      upsertCalls: [] as unknown[],
      findUnique: async ({ where }: { where: { email: string } }) =>
        profileRecords.find((profile) => profile.email === where.email) ?? null,
      upsert: async (args: unknown) => {
        mock.profile.upsertCalls.push(args);
        throw new Error("Unexpected profile upsert");
      }
    },
    housingListing: {
      createCalls: [] as unknown[],
      updateCalls: [] as unknown[],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        mock.housingListing.createCalls.push({ data });
        return { id: "listing-1", ...data };
      },
      findFirst: async ({ where }: { where: { id: string; ownerId: string } }) =>
        listingRecords.find((listing) => listing.id === where.id && listing.ownerId === where.ownerId) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        mock.housingListing.updateCalls.push({ where, data });
        return { ...listingRecords.find((listing) => listing.id === where.id), ...data };
      }
    }
  };

  return mock;
}
