export function getVisibleSelectedListing<T extends { id: string }>(current: T, visibleListings: T[]) {
  return visibleListings.find((listing) => listing.id === current.id) ?? visibleListings[0] ?? current;
}

export function isSelectedListing<T extends { id: string }>(selectedId: string, listing: T) {
  return listing.id === selectedId;
}

export function getListingCardDomId(listingId: string) {
  return `listing-card-${listingId}`;
}
