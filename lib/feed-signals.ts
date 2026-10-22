import { defaultSearch, parseSearchState, searchHref, type SearchState } from "./search-state";

/**
 * What this device remembers for the listing feeds: listings opened recently (newest first) and the last search.
 * Stored per account next to the saved lists, and never sent to the server.
 */
export type FeedSignals = { version: 1; viewedIds: string[]; lastSearch: string };

const maxViewed = 30;

export function feedSignalsStorageKey(accountKey: string) {
  return `sublet-feed-signals-v1:${accountKey}`;
}

export function normalizeFeedSignals(value: unknown): FeedSignals {
  const record = typeof value === "object" && value !== null ? value as Partial<Record<keyof FeedSignals, unknown>> : {};
  if (record.version !== 1) return { version: 1, viewedIds: [], lastSearch: "" };
  const viewedIds = Array.isArray(record.viewedIds)
    ? [...new Set(record.viewedIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))].slice(0, maxViewed)
    : [];
  const lastSearch = typeof record.lastSearch === "string" && record.lastSearch.startsWith("/search?") ? record.lastSearch : "";
  return { version: 1, viewedIds, lastSearch };
}

export function recordListingView(signals: FeedSignals, listingId: string): FeedSignals {
  if (!listingId.trim() || signals.viewedIds[0] === listingId) return signals;
  return { ...signals, viewedIds: [listingId, ...signals.viewedIds.filter((id) => id !== listingId)].slice(0, maxViewed) };
}

/** Keeps what the renter asked for (place, dates, budget, rooms, amenities); page, view, sort and the open pin are not intent. */
export function recordSearch(signals: FeedSignals, state: SearchState): FeedSignals {
  const { query, moveIn, moveOut, priceMin, priceMax, beds, amenities } = state;
  const href = searchHref({ ...defaultSearch, query, moveIn, moveOut, priceMin, priceMax, beds, amenities });
  return href === searchHref(defaultSearch) || href === signals.lastSearch ? signals : { ...signals, lastSearch: href };
}

/** The last search as search state. Dates that have already started are dropped, the place and budget still count. */
export function lastSearchState(signals: FeedSignals, today: string): SearchState | null {
  if (!signals.lastSearch) return null;
  const parsed = parseSearchState(new URLSearchParams(signals.lastSearch.slice("/search?".length)));
  const state = parsed.moveIn && parsed.moveIn < today ? { ...parsed, moveIn: "", moveOut: "" } : parsed;
  return searchHref(state) === searchHref(defaultSearch) ? null : state;
}
