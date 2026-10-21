/**
 * psw date display. One style everywhere:
 * - long, for dates people choose or confirm (search, booking box, phone bar, messages): 「11月1日 – 1月15日」
 * - short, for scanning lists (cards, map): 「11/1 – 1/15」
 * The year appears only on a date outside the current year: 「11月1日 – 2027年1月15日」.
 * Ranges use an en dash with spaces.
 */
const isoDate = /^(\d{4})-(\d{2})-(\d{2})/;

let yearFormat: Intl.DateTimeFormat | undefined;

/** Current year in the marketplace's time zone, the same clock as the availability checks. */
export function currentYear(now = new Date()) {
  // Building an Intl formatter is slow; a page of cards asks for the year many times.
  yearFormat ??= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric" });
  return Number(yearFormat.format(now));
}

function parts(value: string) {
  const match = isoDate.exec(value ?? "");
  return match ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) } : null;
}

export function formatDateLong(value: string, year = currentYear()) {
  const date = parts(value);
  if (!date) return value;
  return `${date.year === year ? "" : `${date.year}年`}${date.month}月${date.day}日`;
}

export function formatDateShort(value: string, year = currentYear()) {
  const date = parts(value);
  if (!date) return value;
  return `${date.year === year ? "" : `${date.year}/`}${date.month}/${date.day}`;
}

export function formatRangeLong(from: string, to: string, year = currentYear()) {
  return `${formatDateLong(from, year)} – ${formatDateLong(to, year)}`;
}

export function formatRangeShort(from: string, to: string, year = currentYear()) {
  return `${formatDateShort(from, year)} – ${formatDateShort(to, year)}`;
}
