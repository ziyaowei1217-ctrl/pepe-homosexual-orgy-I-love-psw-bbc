export function getVisibleSelectedListing<T extends { id: string }>(current: T, visibleListings: T[]) {
  return visibleListings.find((listing) => listing.id === current.id) ?? visibleListings[0] ?? current;
}

export function isSelectedListing<T extends { id: string }>(selectedId: string, listing: T) {
  return listing.id === selectedId;
}

export function getListingCardDomId(listingId: string) {
  return `listing-card-${listingId}`;
}

export function getRequestedListing<T extends { id: string }>(
  listings: readonly T[],
  requestedId: string | null | undefined,
  current: T
) {
  return (
    (requestedId
      ? listings.find((listing) => listing.id === requestedId)
      : undefined) ??
    listings.find((listing) => listing.id === current.id) ??
    listings[0] ??
    current
  );
}

export function filterSavedListings<T extends { id: string }>(
  listings: T[],
  favoriteIds: ReadonlySet<string>,
  savedOnly: boolean
) {
  return savedOnly ? listings.filter((listing) => favoriteIds.has(listing.id)) : listings;
}
