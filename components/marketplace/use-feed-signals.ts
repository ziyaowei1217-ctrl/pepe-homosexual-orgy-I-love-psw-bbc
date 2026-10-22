"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { feedSignalsStorageKey, normalizeFeedSignals, recordListingView, recordSearch, type FeedSignals } from "@/lib/feed-signals";
import type { SearchState } from "@/lib/search-state";

const changedEvent = "sublet:feed-signals-changed";

/** Recently viewed listings and the last search for this account on this device (lib/feed-signals.ts). */
export function useFeedSignals() {
  const { accountKey } = useSavedListings();
  const raw = useSyncExternalStore(subscribe, () => (accountKey ? readStored(accountKey) : null), () => null);
  const signals = useMemo(() => normalizeFeedSignals(safelyParse(raw)), [raw]);
  const update = useCallback((change: (current: FeedSignals) => FeedSignals) => {
    if (!accountKey) return;
    const current = normalizeFeedSignals(safelyParse(readStored(accountKey)));
    const next = change(current);
    if (next === current) return;
    try {
      window.localStorage.setItem(feedSignalsStorageKey(accountKey), JSON.stringify(next));
    } catch {
      return; // Without storage the feeds keep their defaults.
    }
    window.dispatchEvent(new Event(changedEvent));
  }, [accountKey]);
  const viewListing = useCallback((listingId: string) => update((current) => recordListingView(current, listingId)), [update]);
  const rememberLastSearch = useCallback((state: SearchState) => update((current) => recordSearch(current, state)), [update]);
  const clearViewed = useCallback(() => update((current) => current.viewedIds.length ? { ...current, viewedIds: [] } : current), [update]);
  return { signals, viewListing, rememberLastSearch, clearViewed };
}

function subscribe(onChange: () => void) {
  window.addEventListener(changedEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(changedEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored(accountKey: string) {
  try {
    return window.localStorage.getItem(feedSignalsStorageKey(accountKey));
  } catch {
    return null;
  }
}

function safelyParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
