export function getVisibleSelectedListing<T extends { id: string }>(current: T, visibleListings: T[]) {
  return visibleListings.find((listing) => listing.id === current.id) ?? visibleListings[0] ?? current;
}
