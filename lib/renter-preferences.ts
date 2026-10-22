"use client";

import { useMemo, useSyncExternalStore } from "react";

import { formatDateLong, formatRangeLong } from "./date-format";
import { destinationMarket } from "./listing-match";
import { dateOnly, localDate } from "./listing-stay";
import { searchAmenities, type SearchState } from "./search-state";
import { formatUsd } from "./stay-price";

/**
 * What a renter wants from a home, used to rank listings by match (lib/listing-match.ts).
 * Saved on this device. While a search is open, what its filters already guarantee is left out (withSearchState).
 */
export type RenterPreferences = {
  /** School, company or neighborhood the renter goes to, e.g. "UCLA". */
  destination: string;
  /** Highest monthly rent; 0 = not set. */
  budgetMax: number;
  /** YYYY-MM-DD or "", never before today. A move-out needs a move-in. */
  moveIn: string;
  moveOut: string;
  /** Fewest bedrooms; 0 = any. */
  beds: number;
  /** Labels from searchAmenities. */
  mustHave: string[];
};

export const emptyRenterPreferences: RenterPreferences = { destination: "", budgetMax: 0, moveIn: "", moveOut: "", beds: 0, mustHave: [] };

const storageKey = "sublet_renter_preferences_v1";
const changedEvent = "sublet:renter-preferences-changed";

/** A move-in saved months ago that has passed becomes today, as listing availability does (earliestListingDate). */
export function normalizeRenterPreferences(value: unknown, today = localDate()): RenterPreferences {
  if (!value || typeof value !== "object") return emptyRenterPreferences;
  const candidate = value as Record<string, unknown>;
  const savedMoveIn = dateOnly(candidate.moveIn);
  const moveIn = savedMoveIn && savedMoveIn < today ? today : savedMoveIn;
  const moveOut = moveIn ? dateOnly(candidate.moveOut) : "";
  return {
    destination: typeof candidate.destination === "string" ? candidate.destination.trim().slice(0, 80) : "",
    budgetMax: wholeNumber(candidate.budgetMax, 1_000_000),
    moveIn,
    moveOut: moveOut > moveIn ? moveOut : "",
    beds: wholeNumber(candidate.beds, 4),
    mustHave: Array.isArray(candidate.mustHave)
      ? searchAmenities.filter((amenity) => (candidate.mustHave as unknown[]).includes(amenity))
      : []
  };
}

export function hasRenterPreferences(preferences: RenterPreferences) {
  return Boolean(preferences.destination || preferences.budgetMax || preferences.moveIn || preferences.beds || preferences.mustHave.length);
}

/**
 * The preferences left to rank a search by. Every result already passes the search's filters, so a
 * preference a filter guarantees is dropped (a stricter saved budget or bedroom count stays), and the
 * search's dates replace saved ones. A search for a place in another city replaces the saved destination;
 * plain keywords such as 独卫 never become one.
 */
export function withSearchState(
  preferences: RenterPreferences,
  search: Pick<SearchState, "query" | "priceMax" | "moveIn" | "moveOut" | "beds" | "amenities">
): RenterPreferences {
  const searchDates = Boolean(search.moveIn && search.moveOut > search.moveIn);
  const searchMarket = destinationMarket(search.query);
  return {
    destination: searchMarket && destinationMarket(preferences.destination)?.id !== searchMarket.id ? search.query.trim() : preferences.destination,
    budgetMax: search.priceMax && search.priceMax <= preferences.budgetMax ? 0 : preferences.budgetMax,
    moveIn: searchDates ? "" : preferences.moveIn,
    moveOut: searchDates ? "" : preferences.moveOut,
    beds: search.beds >= preferences.beds ? 0 : preferences.beds,
    mustHave: preferences.mustHave.filter((amenity) => !search.amenities.includes(amenity))
  };
}

/** Short labels for a summary line: ["UCLA", "≤ $1,800/月", "8月1日 – 12月20日", "2+ 卧", "独卫"]. */
export function describeRenterPreferences(preferences: RenterPreferences) {
  return [
    preferences.destination,
    preferences.budgetMax ? `≤ ${formatUsd(preferences.budgetMax)}/月` : "",
    preferences.moveIn
      ? preferences.moveOut ? formatRangeLong(preferences.moveIn, preferences.moveOut) : `${formatDateLong(preferences.moveIn)}入住`
      : "",
    preferences.beds ? `${preferences.beds}+ 卧` : "",
    ...preferences.mustHave
  ].filter(Boolean);
}

export function writeRenterPreferences(preferences: RenterPreferences) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(normalizeRenterPreferences(preferences)));
  } catch {
    // Private sessions may deny storage; matching then uses the current search only.
  }
  window.dispatchEvent(new Event(changedEvent));
}

export function useRenterPreferences(): [RenterPreferences, (preferences: RenterPreferences) => void] {
  const raw = useSyncExternalStore(subscribe, readStored, () => null);
  const preferences = useMemo(() => normalizeRenterPreferences(safelyParse(raw)), [raw]);
  return [preferences, writeRenterPreferences];
}

function subscribe(onChange: () => void) {
  window.addEventListener(changedEvent, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(changedEvent, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readStored() {
  try {
    return window.localStorage.getItem(storageKey);
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

function wholeNumber(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : 0;
}
