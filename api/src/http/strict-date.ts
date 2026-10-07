import { BadRequestException } from "@nestjs/common";

const calendarPrefix = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/**
 * class-validator's ISO checks accept week/ordinal forms that `new Date` cannot parse and
 * impossible days (2026-02-30) that `new Date` silently rolls into the next month.
 * Require a real YYYY-MM-DD calendar date and a parseable instant.
 */
export function parseStrictDate(value: string, field: string): Date {
  const match = calendarPrefix.exec(value);
  const date = new Date(value);
  if (!match || Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be an ISO 8601 date starting with YYYY-MM-DD`);
  }
  const [year, month, day] = match.slice(1).map(Number);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
    throw new BadRequestException(`${field} is not a real calendar date`);
  }
  return date;
}
