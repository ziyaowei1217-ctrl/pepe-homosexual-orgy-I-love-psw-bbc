/**
 * psw price display: once a renter has chosen dates, the headline number is the rent for exactly those dates
 * (design system: 「用户选了日期，大数字就是你的日期内要付的总价」). Without dates the monthly rent stays the headline.
 *
 * Proration follows the most common US residential method: every whole month from the move-in date is charged at the
 * monthly rent, and the remaining days are prorated by the actual length of that month
 * (e.g. 6/1 → 8/31 at $1,680 = 2 × $1,680 + 30/31 × $1,680 = $4,986).
 * Rent is the only charge the catalogue knows about today; platform fees are confirmed after acceptance.
 */
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dayMs = 86_400_000;

export type StayPrice = {
  /** Nights between move-in and move-out. */
  days: number;
  /** Whole months counted from the move-in date. */
  wholeMonths: number;
  /** Days left after the whole months. */
  extraDays: number;
  /** Length of the month those extra days fall in (the proration base). */
  extraPeriodDays: number;
  /** Rent for the extra days, whole dollars. */
  extraAmount: number;
  /** Rent for the whole stay, whole dollars: wholeMonths × monthly + extraAmount. */
  total: number;
  /** Monthly rent the total was built from. */
  monthly: number;
};

function parse(value: string) {
  if (!isoDate.test(value)) return Number.NaN;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : Number.NaN;
}

function daysBetween(from: string, to: string) {
  return Math.round((parse(to) - parse(from)) / dayMs);
}

/** Same day of the month, `months` later; clamps to the month's last day (1/31 + 1 month = 2/28). */
export function addMonthsClamped(value: string, months: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const index = month - 1 + months;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = ((index % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function stayDays(moveIn: string, moveOut: string): number {
  const start = parse(moveIn);
  const end = parse(moveOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.round((end - start) / dayMs);
}

export function stayPrice(monthly: number, moveIn: string, moveOut: string): StayPrice | null {
  const days = stayDays(moveIn, moveOut);
  if (!days || !Number.isFinite(monthly) || monthly <= 0) return null;
  let wholeMonths = 0;
  // ISO dates compare correctly as strings.
  while (addMonthsClamped(moveIn, wholeMonths + 1) <= moveOut) wholeMonths += 1;
  const anchor = addMonthsClamped(moveIn, wholeMonths);
  const extraDays = daysBetween(anchor, moveOut);
  const extraPeriodDays = extraDays ? daysBetween(anchor, addMonthsClamped(moveIn, wholeMonths + 1)) : 0;
  const extraAmount = extraDays ? Math.round((monthly * extraDays) / extraPeriodDays) : 0;
  return { days, wholeMonths, extraDays, extraPeriodDays, extraAmount, total: wholeMonths * monthly + extraAmount, monthly };
}

/** "2 个月 30 天", "3 个月" or "19 天". */
export function formatStayLength(price: Pick<StayPrice, "wholeMonths" | "extraDays">): string {
  const parts = [price.wholeMonths ? `${price.wholeMonths} 个月` : "", price.extraDays ? `${price.extraDays} 天` : ""];
  return parts.filter(Boolean).join(" ");
}

export function formatUsd(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
