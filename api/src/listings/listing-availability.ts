import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function parseListingDate(value: string, field: string) {
  if (!isoDatePattern.test(value)) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} must be a valid YYYY-MM-DD date`);
  }

  return parsed;
}

export function validateListingAvailability(from: string, to: string) {
  const availableFrom = parseListingDate(from, "availableFrom");
  const availableTo = parseListingDate(to, "availableTo");

  if (availableFrom.getTime() >= availableTo.getTime()) {
    throw new BadRequestException("availableTo must be after availableFrom");
  }

  return { availableFrom, availableTo };
}

export function buildListingAvailabilityWhere(query: {
  moveIn?: string;
  moveOut?: string;
}): Prisma.ListingWhereInput {
  const hasMoveIn = query.moveIn !== undefined;
  const hasMoveOut = query.moveOut !== undefined;

  if (!hasMoveIn && !hasMoveOut) return {};
  if (!hasMoveIn || !hasMoveOut) {
    throw new BadRequestException("moveIn and moveOut must be provided together");
  }

  const { availableFrom, availableTo } = validateListingAvailability(
    query.moveIn as string,
    query.moveOut as string
  );

  return {
    availableFrom: { lte: availableFrom },
    availableTo: { gte: availableTo }
  };
}
