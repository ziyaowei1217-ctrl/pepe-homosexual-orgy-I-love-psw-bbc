import { apiGet } from "./api";
import type { ApiListing } from "./api";
import { getApproximateListingCoordinates } from "./listing-map";
import { getListingCoverUrl, getListingImageUrls } from "./listing-media";
import { ProductApiError } from "./product-errors";
import {
  createPreviewListings,
  isPreviewDataEnabled,
  type PreviewListing
} from "./preview-data";

type LoadMarketplaceListingsOptions = {
  fetchListings?: () => Promise<ApiListing[]>;
  previewEnabled?: boolean;
};

type LoadMarketplaceListingOptions = {
  fetchListing?: (listingId: string) => Promise<ApiListing>;
  previewEnabled?: boolean;
};

export function normalizeMarketplaceListing(listing: ApiListing): PreviewListing {
  const coordinates = getApproximateListingCoordinates(listing.id, listing.area);

  return {
    id: listing.id,
    title: listing.title,
    area: listing.area,
    image: getListingCoverUrl(listing),
    images: getListingImageUrls(listing),
    price: listing.price,
    originalPrice: listing.originalPrice,
    beds: listing.beds,
    baths: listing.baths,
    commute: listing.commute,
    transit: listing.transit,
    trust: listing.trust,
    tags: listing.tags,
    score: listing.score,
    availableFrom: toDateOnly(listing.availableFrom),
    availableTo: toDateOnly(listing.availableTo),
    latitude: coordinates.lat,
    longitude: coordinates.lng,
    listedAt: listing.reviewedAt ?? listing.createdAt
  };
}

export async function loadMarketplaceListings(
  options: LoadMarketplaceListingsOptions = {}
): Promise<PreviewListing[]> {
  const fetchListings = options.fetchListings ?? (() => apiGet<ApiListing[]>("/listings"));
  const previewEnabled = options.previewEnabled ?? isPreviewDataEnabled();

  try {
    return (await fetchListings()).map(normalizeMarketplaceListing);
  } catch (error) {
    if (previewEnabled) return createPreviewListings();
    throw error;
  }
}

export async function loadMarketplaceListing(
  listingId: string,
  options: LoadMarketplaceListingOptions = {}
): Promise<PreviewListing> {
  const previewEnabled = options.previewEnabled ?? isPreviewDataEnabled();
  if (previewEnabled) {
    const preview = createPreviewListings().find((item) => item.id === listingId);
    if (preview) return preview;
  }

  const fetchListing = options.fetchListing ?? (
    (id: string) => apiGet<ApiListing>(`/listings/${encodeURIComponent(id)}`)
  );
  try {
    return normalizeMarketplaceListing(await fetchListing(listingId));
  } catch (error) {
    // Preview builds run without the API, so an id that is not a preview listing does not exist there.
    if (previewEnabled) throw new ProductApiError({ category: "validation", message: "Listing not found", retryable: false, status: 404 });
    throw error;
  }
}

function toDateOnly(value: string | undefined) {
  return value?.slice(0, 10) ?? "";
}
