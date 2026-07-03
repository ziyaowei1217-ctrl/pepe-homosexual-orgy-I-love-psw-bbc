export type DateRange = {
  checkIn: string;
  checkOut: string;
};

export type CalendarDay = {
  iso: string;
  day: number;
  inCurrentMonth: boolean;
};

export type CalendarMonth = {
  key: string;
  label: string;
  days: CalendarDay[];
};

const dayMs = 24 * 60 * 60 * 1000;
const monthFormatter = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

export function selectDateRange(range: DateRange, isoDate: string): DateRange {
  if (!range.checkIn || range.checkOut || compareIsoDates(isoDate, range.checkIn) <= 0) {
    return { checkIn: isoDate, checkOut: "" };
  }

  return { ...range, checkOut: isoDate };
}

export function applyFlexibleStay(range: DateRange, nights: number): DateRange {
  const checkIn = range.checkIn || toIsoDate(new Date());

  return {
    checkIn,
    checkOut: addDays(checkIn, nights)
  };
}

export function countNights(range: DateRange): number {
  if (!range.checkIn || !range.checkOut) return 0;

  return Math.max(0, Math.round((parseIsoDate(range.checkOut).getTime() - parseIsoDate(range.checkIn).getTime()) / dayMs));
}

export function formatShortDate(isoDate: string) {
  if (!isoDate) return "";

  const date = parseIsoDate(isoDate);
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

export function formatDateRangeLabel(range: DateRange) {
  if (!range.checkIn) return "选择日期";
  if (!range.checkOut) return `${formatShortDate(range.checkIn)} 入住`;

  return `${formatShortDate(range.checkIn)} - ${formatShortDate(range.checkOut)} · ${countNights(range)} 晚`;
}

export function buildCalendarMonths(startIso: string, count: number): CalendarMonth[] {
  const start = parseIsoDate(startIso || toIsoDate(new Date()));
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  return Array.from({ length: count }, (_, index) => buildCalendarMonth(addMonths(firstMonth, index)));
}

export function addDays(isoDate: string, days: number) {
  const date = parseIsoDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);

  return toIsoDate(date);
}

export function compareIsoDates(left: string, right: string) {
  return parseIsoDate(left).getTime() - parseIsoDate(right).getTime();
}

function buildCalendarMonth(monthStart: Date): CalendarMonth {
  const year = monthStart.getUTCFullYear();
  const month = monthStart.getUTCMonth();
  const firstDay = monthStart.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const leadingDays = firstDay === 0 ? 6 : firstDay - 1;
  const days: CalendarDay[] = [];

  for (let offset = leadingDays; offset > 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month, 1 - offset));
    days.push({ iso: toIsoDate(date), day: date.getUTCDate(), inCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    days.push({ iso: toIsoDate(date), day, inCurrentMonth: true });
  }

  while (days.length % 7 !== 0) {
    const date = new Date(Date.UTC(year, month, daysInMonth + (days.length % 7)));
    days.push({ iso: toIsoDate(date), day: date.getUTCDate(), inCurrentMonth: false });
  }

  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: monthFormatter.format(monthStart),
    days
  };
}

function addMonths(date: Date, months: number) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
