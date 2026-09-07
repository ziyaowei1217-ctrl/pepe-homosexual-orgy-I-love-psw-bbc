import { BadRequestException } from "@nestjs/common";

const businessDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

export function applicationBusinessDate(now = new Date()): string {
  const parts = businessDateFormatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Rental dates are date-only values stored at UTC midnight, not local instants.
export function assertMoveInNotPast(moveIn: Date, now = new Date()) {
  const today = applicationBusinessDate(now);
  if (moveIn.toISOString().slice(0, 10) < today) {
    throw new BadRequestException("入住日期不能早于洛杉矶当前日期");
  }
}
