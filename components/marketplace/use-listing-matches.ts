"use client";

import { useMemo, useState } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useFeedSignals } from "@/components/marketplace/use-feed-signals";
import { interestListings } from "@/lib/listing-feeds";
import { rankListingsByMatch, type ListingMatch } from "@/lib/listing-match";
import type { PreviewListing } from "@/lib/preview-data";
import { useRenterPreferences, withSearchState } from "@/lib/renter-preferences";

/** Each listing's match for this renter: saved preferences, minus what the search they are in or came from guarantees. */
export function useListingMatches(listings: readonly PreviewListing[], search: Parameters<typeof withSearchState>[1]) {
  const [saved, savePreferences] = useRenterPreferences();
  const { savedIds, hydrated } = useSavedListings();
  const { signals } = useFeedSignals();
  // Saved and viewed homes as they were when the page loaded, so a heart tap or a recorded view does not
  // reshuffle the list being read.
  const [seen, setSeen] = useState<{ savedIds: string[]; viewedIds: string[] }>();
  if (hydrated && !seen) setSeen({ savedIds: [...savedIds], viewedIds: signals.viewedIds });
  const interest = useMemo(() => seen ? interestListings(listings, seen.savedIds, seen.viewedIds) : [], [listings, seen]);
  const { query, priceMax, moveIn, moveOut, beds, amenities } = search;
  const preferences = useMemo(
    () => withSearchState(saved, { query, priceMax, moveIn, moveOut, beds, amenities }),
    [saved, query, priceMax, moveIn, moveOut, beds, amenities]
  );
  const matches = useMemo(() => new Map<string, ListingMatch | null>(
    rankListingsByMatch(listings, preferences, { interest }).map(({ listing, match }) => [listing.id, match])
  ), [interest, listings, preferences]);
  return { savedPreferences: saved, savePreferences, preferences, matches, interest };
}
