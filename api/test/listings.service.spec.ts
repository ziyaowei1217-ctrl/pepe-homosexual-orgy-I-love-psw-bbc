import { describe, expect, it } from "vitest";

import { ListingsService } from "../src/listings/listings.service";

describe("ListingsService", () => {
  it("creates listings for the current user and returns normalized listing DTOs", async () => {
    const prisma = createPrismaMock();
    const service = new ListingsService(prisma as never);

    const listing = await service.create("user-1", {
      title: "Fenway verified sublet",
      area: "Boston · Fenway",
      image: "https://example.com/home.jpg",
      price: 1420,
      originalPrice: 1680,
      beds: 1,
      baths: 1,
      commute: "步行 12 分钟到 Northeastern",
      transit: "地铁 18 分钟到 Back Bay",
      trust: ".edu 已认证 · 房东知情",
      tags: ["独卫", "电梯"],
      score: 4.92
    });

    expect(listing.ownerId).toBe("user-1");
    expect(listing.tags).toEqual(["独卫", "电梯"]);
    expect(prisma.listing.createCalls[0].data.price).toBe(1420);
  });
});

function createPrismaMock() {
  const mock = {
    listing: {
      createCalls: [] as Array<{ data: Record<string, unknown> }>,
      create: async (args: { data: Record<string, unknown> }) => {
        mock.listing.createCalls.push(args);
        return { id: "listing-1", createdAt: new Date(), updatedAt: new Date(), ...args.data };
      }
    }
  };

  return mock;
}
