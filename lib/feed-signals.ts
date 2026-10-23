"use client";

import { readLocalStore, useLocalStore, writeLocalStore } from "./local-store";
import { defaultSearch, parseSearchState, searchHref, type SearchState } from "./search-state";

/**
 * What this browser remembers for the listing feeds: homes opened recently (newest first) and the last search.
 * Kept next to the match preferences (lib/renter-preferences.ts) and never sent to the server.
 */
export type FeedSignals = { viewedIds: string[]; lastSearch: string };

const storageKey = "sublet_feed_signals_v1";
const maxViewed = 30;

export function normalizeFeedSignals(value: unknown): FeedSignals {
  const candidate = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const viewedIds = Array.isArray(candidate.viewedIds)
    ? [...new Set(candidate.viewedIds.filter((id): id is string => typeof id === "string" && id.trim() !== ""))].slice(0, maxViewed)
    : [];
  const lastSearch = typeof candidate.lastSearch === "string" && candidate.lastSearch.startsWith("/search?") ? candidate.lastSearch : "";
  return { viewedIds, lastSearch };
}

export function recordListingView(signals: FeedSignals, listingId: string): FeedSignals {
  if (!listingId.trim() || signals.viewedIds[0] === listingId) return signals;
  return { ...signals, viewedIds: [listingId, ...signals.viewedIds.filter((id) => id !== listingId)].slice(0, maxViewed) };
}

/** Keeps what the renter asked for (place, dates, budget, rooms, amenities); page, view, sort and the open pin are not. No conditions clears it. */
export function recordSearch(signals: FeedSignals, state: SearchState): FeedSignals {
  const { query, moveIn, moveOut, priceMin, priceMax, beds, amenities } = state;
  const href = searchHref({ ...defaultSearch, query, moveIn, moveOut, priceMin, priceMax, beds, amenities });
  const lastSearch = href === searchHref(defaultSearch) ? "" : href;
  return lastSearch === signals.lastSearch ? signals : { ...signals, lastSearch };
}

/** The last search as search state. Dates that have already started are dropped; the place and budget still count. */
export function lastSearchState(lastSearch: string, today: string): SearchState | null {
  if (!lastSearch) return null;
  const parsed = parseSearchState(new URLSearchParams(lastSearch.slice("/search?".length)));
  const state = parsed.moveIn && parsed.moveIn < today ? { ...parsed, moveIn: "", moveOut: "" } : parsed;
  return searchHref(state) === searchHref(defaultSearch) ? null : state;
}

export function useFeedSignals() {
  return useLocalStore(storageKey, normalizeFeedSignals);
}

export function rememberListingView(listingId: string) {
  update((signals) => recordListingView(signals, listingId));
}

export function rememberLastSearch(state: SearchState) {
  update((signals) => recordSearch(signals, state));
}

export function forgetListingViews() {
  update((signals) => signals.viewedIds.length ? { ...signals, viewedIds: [] } : signals);
}

/** Changes what is stored now rather than a render's copy, so two writers do not undo each other. */
function update(change: (signals: FeedSignals) => FeedSignals) {
  const current = readLocalStore(storageKey, normalizeFeedSignals);
  const next = change(current);
  if (next !== current) writeLocalStore(storageKey, next);
}
