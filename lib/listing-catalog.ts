export type CatalogSort =
  | "recommended"
  | "price-low"
  | "price-high"
  | "rating";

export type CatalogQuery = {
  query: string;
  priceMin: number;
  priceMax: number;
  amenity: string;
  checkIn: string;
  checkOut: string;
  sort: CatalogSort;
  page: number;
  pageSize: number;
};

export type CatalogListing = {
  id: string;
  title: string;
  area: string;
  price: number;
  score: number;
  baths: number;
  transit: string;
  tags: string[];
  commute?: string;
  trust?: string;
  availableFrom?: string;
  availableTo?: string;
};

export type CatalogPage<T extends CatalogListing> = {
  items: T[];
  mapItems: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  dateFilterAvailable: boolean;
  heading: string;
  summary: string;
};

export function buildCatalogPage<T extends CatalogListing>(
  listings: readonly T[],
  query: CatalogQuery
): CatalogPage<T> {
  const dateFilterAvailable = canFilterCatalogByDate(listings);
  const normalizedQuery = normalizeText(query.query);
  const filtered = listings.filter((listing) => {
    const haystack = normalizeText(
      [
        listing.title,
        listing.area,
        listing.commute ?? "",
        listing.transit,
        listing.trust ?? "",
        ...listing.tags
      ].join(" ")
    );
    const matchesQuery =
      normalizedQuery.length === 0 ||
      haystack.includes(normalizedQuery) ||
      (normalizedQuery === "la" && haystack.includes("los angeles"));
    const matchesPrice =
      listing.price >= Math.min(query.priceMin, query.priceMax) &&
      listing.price <= Math.max(query.priceMin, query.priceMax);
    const matchesAmenity = matchesListingAmenity(listing, query.amenity);
    const matchesDate =
      !dateFilterAvailable ||
      !query.checkIn ||
      !query.checkOut ||
      Boolean(
        listing.availableFrom &&
          listing.availableTo &&
          listing.availableFrom <= query.checkIn &&
          listing.availableTo >= query.checkOut
      );

    return matchesQuery && matchesPrice && matchesAmenity && matchesDate;
  });
  const sorted = sortCatalogListings(filtered, query.sort);
  const pageSize = Math.max(1, Math.floor(query.pageSize));
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const page = Math.min(Math.max(1, Math.floor(query.page)), pageCount);
  const items = sorted.slice((page - 1) * pageSize, page * pageSize);

  return {
    items,
    mapItems: items,
    total: sorted.length,
    page,
    pageSize,
    pageCount,
    dateFilterAvailable,
    heading: buildCatalogHeading(query),
    summary: `${sorted.length} 套符合条件 · 第 ${page}/${pageCount} 页`
  };
}

export function canFilterCatalogByDate(listings: readonly CatalogListing[]) {
  return (
    listings.length > 0 &&
    listings.every(
      (listing) =>
        typeof listing.availableFrom === "string" &&
        listing.availableFrom.length > 0 &&
        typeof listing.availableTo === "string" &&
        listing.availableTo.length > 0
    )
  );
}

export function matchesListingAmenity(listing: CatalogListing, amenity: string) {
  if (!amenity || amenity === "全部") return true;

  const normalizedAmenity = normalizeText(amenity);
  const normalizedTags = listing.tags.map(normalizeText);

  if (amenity === "宠物") return normalizedTags.some((tag) => tag.includes("宠物"));
  if (amenity === "近地铁") {
    return normalizedTags.some((tag) => tag.includes("地铁")) || normalizeText(listing.transit).includes("地铁");
  }
  if (amenity === "独卫") return normalizedTags.some((tag) => tag.includes("独卫"));

  return normalizedTags.some(
    (tag) => tag === normalizedAmenity || tag.includes(normalizedAmenity)
  );
}

function sortCatalogListings<T extends CatalogListing>(listings: readonly T[], sort: CatalogSort) {
  return [...listings].sort((left, right) => {
    if (sort === "price-low") return left.price - right.price || compareIds(left.id, right.id);
    if (sort === "price-high") return right.price - left.price || compareIds(left.id, right.id);
    if (sort === "rating") return right.score - left.score || left.price - right.price;
    return right.score - left.score || left.price - right.price || compareIds(left.id, right.id);
  });
}

function buildCatalogHeading(query: CatalogQuery) {
  const location = query.query.trim() || "全部地区";
  const amenity = query.amenity && query.amenity !== "全部" ? ` · ${query.amenity}` : "";
  return `${location} 的可租房源${amenity}`;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function compareIds(left: string, right: string) {
  return left.localeCompare(right, undefined, { numeric: true });
}
