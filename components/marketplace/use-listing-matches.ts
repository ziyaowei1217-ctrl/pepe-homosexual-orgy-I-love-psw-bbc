"use client";

import { useMemo } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { rankListingsByMatch, type ListingMatch } from "@/lib/listing-match";
import type { PreviewListing } from "@/lib/preview-data";
import { useRenterPreferences, withSearchState } from "@/lib/renter-preferences";
import type { SearchState } from "@/lib/search-state";

type SearchConditions = Pick<SearchState, "query" | "priceMax" | "moveIn" | "moveOut" | "beds" | "amenities">;

/** Each listing's match for this renter: saved preferences, overlaid by the search they are in or came from. */
export function useListingMatches(listings: readonly PreviewListing[], search: SearchConditions) {
  const [saved, savePreferences] = useRenterPreferences();
  const { savedIds } = useSavedListings();
  const { query, priceMax, moveIn, moveOut, beds, amenities } = search;
  const preferences = useMemo(
    () => withSearchState(saved, { query, priceMax, moveIn, moveOut, beds, amenities }),
    [saved, query, priceMax, moveIn, moveOut, beds, amenities]
  );
  const matches = useMemo(() => {
    const interest = listings.filter((listing) => savedIds.has(listing.id));
    return new Map<string, ListingMatch | null>(
      rankListingsByMatch(listings, preferences, { interest }).map(({ listing, match }) => [listing.id, match])
    );
  }, [listings, preferences, savedIds]);
  return { savedPreferences: saved, savePreferences, preferences, matches };
}
