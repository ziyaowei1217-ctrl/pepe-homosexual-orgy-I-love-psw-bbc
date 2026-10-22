"use client";

import { useMemo, useState } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { rankListingsByMatch, type ListingMatch } from "@/lib/listing-match";
import type { PreviewListing } from "@/lib/preview-data";
import { useRenterPreferences, withSearchState } from "@/lib/renter-preferences";

/** Each listing's match for this renter: saved preferences, minus what the search they are in or came from guarantees. */
export function useListingMatches(listings: readonly PreviewListing[], search: Parameters<typeof withSearchState>[1]) {
  const [saved, savePreferences] = useRenterPreferences();
  const { savedIds, hydrated } = useSavedListings();
  // Saved homes as they were when the page loaded, so tapping a heart does not reshuffle the list being read.
  const [interestIds, setInterestIds] = useState<ReadonlySet<string>>();
  if (hydrated && !interestIds) setInterestIds(savedIds);
  const { query, priceMax, moveIn, moveOut, beds, amenities } = search;
  const preferences = useMemo(
    () => withSearchState(saved, { query, priceMax, moveIn, moveOut, beds, amenities }),
    [saved, query, priceMax, moveIn, moveOut, beds, amenities]
  );
  const matches = useMemo(() => {
    const interest = listings.filter((listing) => interestIds?.has(listing.id));
    return new Map<string, ListingMatch | null>(
      rankListingsByMatch(listings, preferences, { interest }).map(({ listing, match }) => [listing.id, match])
    );
  }, [listings, preferences, interestIds]);
  return { savedPreferences: saved, savePreferences, preferences, matches };
}
