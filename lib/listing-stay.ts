import { formatRangeLong } from "./date-format";

export type ListingStay = { moveIn: string; moveOut: string };
type Availability = { availableFrom: string; availableTo: string };

let dayFormat: Intl.DateTimeFormat | undefined;

export function localDate(now = new Date()) {
  // One formatter for the whole page: every card and date check asks for today.
  dayFormat ??= new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  return dayFormat.format(now);
}

/** The value if it is a real YYYY-MM-DD date, else "". */
export function dateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

export function earliestListingDate(listing: Pick<Availability, "availableFrom">, today = localDate()) {
  return [dateOnly(listing.availableFrom.slice(0, 10)), today].sort().at(-1)!;
}

/** Some dates after today are still open. */
export function isListingBookable(listing: Availability, today = localDate()) {
  return Boolean(listing.availableFrom && listing.availableTo > earliestListingDate(listing, today));
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
