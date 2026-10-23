import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";

import { CreateListingDto, UpdateListingDto } from "../src/listings/dto";

const required = {
  title: "Culver City 寒假转租次卧",
  area: "Los Angeles · Culver City",
  availableFrom: "2026-12-15",
  availableTo: "2027-01-20",
  price: 1500,
  beds: 1,
  baths: 1,
  commute: "地铁 20 分钟到 USC",
  trust: "房东知情声明 · 待平台审核",
  tags: ["带家具"]
};

async function errors(type: typeof CreateListingDto | typeof UpdateListingDto, body: Record<string, unknown>) {
  return (await validate(plainToInstance(type, body), { whitelist: true, forbidNonWhitelisted: true })).map((error) => error.property);
}

describe("optional listing fields", () => {
  it("accepts a new listing without nearby transit or the original lease rent", async () => {
    expect(await errors(CreateListingDto, required)).toEqual([]);
    expect(await errors(CreateListingDto, { ...required, transit: "" })).toEqual([]);
  });

  it("still checks them when they are given", async () => {
    expect(await errors(CreateListingDto, { ...required, originalPrice: 0 })).toEqual(["originalPrice"]);
    expect(await errors(CreateListingDto, { ...required, transit: "x".repeat(281) })).toEqual(["transit"]);
  });

  it("lets an edit clear the transit line", async () => {
    expect(await errors(UpdateListingDto, { transit: "" })).toEqual([]);
  });

  it("keeps the fields a renter relies on required", async () => {
    const { commute: _commute, ...withoutCommute } = required;
    expect(await errors(CreateListingDto, withoutCommute)).toEqual(["commute"]);
  });
});
