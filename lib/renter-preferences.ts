"use client";

import { useMemo, useSyncExternalStore } from "react";

import { formatDateShort, formatRangeShort } from "./date-format";
import { searchAmenities, type SearchState } from "./search-state";
import { formatUsd } from "./stay-price";

/**
 * What a renter wants from a home, used to rank listings by match (lib/listing-match.ts).
 * Saved on this device. A search's own conditions win while that search is open (withSearchState).
 */
export type RenterPreferences = {
  /** School, company or neighborhood the renter goes to, e.g. "UCLA". */
  destination: string;
  /** Highest monthly rent; 0 = not set. */
  budgetMax: number;
  /** YYYY-MM-DD or "". A move-out needs a move-in. */
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

export function normalizeRenterPreferences(value: unknown): RenterPreferences {
  if (!value || typeof value !== "object") return emptyRenterPreferences;
  const candidate = value as Record<string, unknown>;
  const moveIn = isoDate(candidate.moveIn);
  const moveOut = moveIn ? isoDate(candidate.moveOut) : "";
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

/** The search's own budget, dates and bedrooms win; its amenities add to the must-haves. */
export function withSearchState(
  preferences: RenterPreferences,
  search: Pick<SearchState, "priceMax" | "moveIn" | "moveOut" | "beds" | "amenities">
): RenterPreferences {
  const searchDates = Boolean(search.moveIn && search.moveOut > search.moveIn);
  return {
    ...preferences,
    budgetMax: search.priceMax || preferences.budgetMax,
    moveIn: searchDates ? search.moveIn : preferences.moveIn,
    moveOut: searchDates ? search.moveOut : preferences.moveOut,
    beds: search.beds || preferences.beds,
    mustHave: searchAmenities.filter((amenity) => preferences.mustHave.includes(amenity) || search.amenities.includes(amenity))
  };
}

/** Short labels for a summary line: ["UCLA", "≤ $1,800/月", "8/1 – 12/20", "2+ 卧", "独卫"]. */
export function describeRenterPreferences(preferences: RenterPreferences) {
  return [
    preferences.destination,
    preferences.budgetMax ? `≤ ${formatUsd(preferences.budgetMax)}/月` : "",
    preferences.moveIn
      ? preferences.moveOut ? formatRangeShort(preferences.moveIn, preferences.moveOut) : `${formatDateShort(preferences.moveIn)} 入住`
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

function isoDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}

function wholeNumber(value: unknown, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.min(max, Math.round(value)) : 0;
}
