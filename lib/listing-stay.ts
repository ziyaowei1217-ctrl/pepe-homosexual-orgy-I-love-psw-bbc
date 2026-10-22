import { formatRangeLong } from "./date-format";

export type ListingStay = { moveIn: string; moveOut: string };
type Availability = { availableFrom: string; availableTo: string };

let dayFormat: Intl.DateTimeFormat | undefined;
let cachedDay = { minute: Number.NaN, day: "" };

export function localDate(now = new Date()) {
  // Every card and date check asks for today; formatting with a time zone is slow, so answer once per minute.
  const minute = Math.floor(now.getTime() / 60_000);
  if (minute !== cachedDay.minute) {
    dayFormat ??= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
    cachedDay = { minute, day: dayFormat.format(now) };
  }
  return cachedDay.day;
}

function dateOnly(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function earliestListingDate(listing: Pick<Availability, "availableFrom">, today = localDate()) {
  return [dateOnly(listing.availableFrom.slice(0, 10)), today].sort().at(-1)!;
}

export function initialListingStay(listing: Availability, requested?: Partial<ListingStay>, today = localDate()): ListingStay {
  if (requested?.moveIn || requested?.moveOut) return { moveIn: dateOnly(requested.moveIn), moveOut: dateOnly(requested.moveOut) };
  return { moveIn: earliestListingDate(listing, today), moveOut: dateOnly(listing.availableTo.slice(0, 10)) };
}

export function listingStayError(stay: ListingStay, listing: Availability, today = localDate()): string | null {
  const from = dateOnly(listing.availableFrom.slice(0, 10));
  const to = dateOnly(listing.availableTo.slice(0, 10));
  if (!from || !to) return "请先联系房东确认可租日期。";
  const earliest = earliestListingDate(listing, today);
  if (to <= earliest) return "该房源暂无可申请租期，可联系房东确认。";
  if (!dateOnly(stay.moveIn)) return "请选择有效的入住日期。";
  if (!dateOnly(stay.moveOut)) return "请选择有效的退租日期。";
  if (stay.moveOut <= stay.moveIn) return "退租日期必须晚于入住日期。";
  if (stay.moveIn < today) return "入住日期不能早于今天。";
  if (stay.moveIn < from || stay.moveOut > to) return `这段日期不能租。可租日期是 ${formatRangeLong(earliest, to)}。`;
  return null;
}

function appendStay(params: URLSearchParams, stay?: Partial<ListingStay>) {
  if (stay?.moveIn) params.set("moveIn", stay.moveIn);
  if (stay?.moveOut) params.set("moveOut", stay.moveOut);
  return params.toString();
}

export function listingHref(id: string, stay?: Partial<ListingStay>) {
  const query = appendStay(new URLSearchParams(), stay);
  return `/listing/${encodeURIComponent(id)}${query ? `?${query}` : ""}`;
}

export function applicationHref(id: string, stay: ListingStay, selectionId?: string) {
  const query = new URLSearchParams(appendStay(new URLSearchParams({ listingId: id }), stay));
  if (selectionId) query.set("selection", selectionId);
  return `/applications/new?${query}`;
}
