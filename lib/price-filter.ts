export type PriceRangeFilter = {
  priceMin: number;
  priceMax: number;
};

export type PriceListing = {
  price: number;
};

export const priceFilterBounds = {
  min: 0,
  max: 6000
} as const;

export function normalizePriceRange(range: PriceRangeFilter): PriceRangeFilter {
  const boundedMin = clampPrice(range.priceMin);
  const boundedMax = clampPrice(range.priceMax);

  return {
    priceMin: Math.min(boundedMin, boundedMax),
    priceMax: Math.max(boundedMin, boundedMax)
  };
}

export function filterListingsByPrice<T extends PriceListing>(listings: T[], range: PriceRangeFilter) {
  const normalized = normalizePriceRange(range);

  return listings.filter((listing) => listing.price >= normalized.priceMin && listing.price <= normalized.priceMax);
}

export function formatPriceRangeLabel(range: PriceRangeFilter) {
  const normalized = normalizePriceRange(range);

  if (normalized.priceMin === priceFilterBounds.min && normalized.priceMax === priceFilterBounds.max) {
    return "全部价格";
  }

  if (normalized.priceMin === priceFilterBounds.min) {
    return `$${normalized.priceMax.toLocaleString()} 以下`;
  }

  return `$${normalized.priceMin.toLocaleString()} - $${normalized.priceMax.toLocaleString()}`;
}

function clampPrice(value: number) {
  if (!Number.isFinite(value)) return priceFilterBounds.min;

  return Math.min(priceFilterBounds.max, Math.max(priceFilterBounds.min, Math.round(value)));
}
