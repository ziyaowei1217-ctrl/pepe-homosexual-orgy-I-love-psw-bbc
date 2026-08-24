export function presentRentalApplication<T extends object>(application: T): Omit<T, "listing"> & { listingTitle?: string } {
  const { listing, ...response } = application as T & { listing?: { title: string } };
  return {
    ...response,
    ...(listing ? { listingTitle: listing.title } : {})
  };
}
