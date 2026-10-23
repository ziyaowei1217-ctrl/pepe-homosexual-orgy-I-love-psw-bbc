/**
 * psw date display. One style everywhere:
 * - long, for dates people choose or confirm (search, booking box, phone bar, messages): 「11月1日 – 1月15日」
 * - short, for scanning lists (cards, map): 「11/1 – 1/15」
 * The year appears only on a date outside the current year: 「11月1日 – 2027年1月15日」.
 * Ranges use an en dash with spaces.
 */
const isoDate = /^(\d{4})-(\d{2})-(\d{2})/;

let yearFormat: Intl.DateTimeFormat | undefined;
let cachedYear = { minute: Number.NaN, year: 0 };

/** Current year in the marketplace's time zone, the same clock as the availability checks. */
export function currentYear(now = new Date()) {
  // Formatting with a time zone is slow and a page of cards asks many times, so answer once per minute.
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute !== cachedYear.minute) {
    yearFormat ??= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric" });
    cachedYear = { minute, year: Number(yearFormat.format(now)) };
  }
  return cachedYear.year;
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
