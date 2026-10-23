import { buildCatalogPage, matchesListingAmenity, type CatalogSort } from "./listing-catalog";
import { formatMapBounds, parseMapBounds, type MapBounds } from "./listing-map";
import type { PreviewListing } from "./preview-data";

export const searchAmenities = ["Wi-Fi", "独卫", "带家具", "宠物", "近地铁", "洗烘"];
export type SearchView = "split" | "list" | "map";
export type SearchFilters = { priceMin: number; priceMax: number; beds: number; amenities: string[] };
export type SearchState = SearchFilters & {
  query: string; moveIn: string; moveOut: string; sort: CatalogSort; view: SearchView; page: number; selected: string;
  /** The map area the results are limited to, set by moving the map. */
  bounds: MapBounds | null;
};
export const emptyFilters: SearchFilters = { priceMin: 0, priceMax: 0, beds: 0, amenities: [] };
export const defaultSearch: SearchState = {
  ...emptyFilters, query: "", moveIn: "", moveOut: "", sort: "recommended", view: "split", page: 1, selected: "", bounds: null
};

export function parseSearchState(params: URLSearchParams): SearchState {
  const priceMin = positiveNumber(params.get("priceMin"));
  const priceMax = positiveNumber(params.get("priceMax"));
  const sort = params.get("sort");
  const view = params.get("view");
  return {
    query: params.get("q") ?? "",
    moveIn: validDate(params.get("moveIn")), moveOut: validDate(params.get("moveOut")),
    priceMin: priceMax && priceMin > priceMax ? priceMax : priceMin,
    priceMax: priceMax && priceMin > priceMax ? priceMin : priceMax,
    beds: Math.min(4, positiveNumber(params.get("beds"))),
    amenities: [...new Set((params.get("amenities") ?? "").split(","))].filter((value) => searchAmenities.includes(value)),
    sort: sort === "price-low" || sort === "price-high" || sort === "rating" ? sort : "recommended",
    view: view === "list" || view === "map" ? view : "split",
    page: Math.max(1, positiveNumber(params.get("page"))), selected: params.get("selected") ?? "",
    bounds: parseMapBounds(params.get("bbox"))
  };
}

export function searchHref(state: SearchState) {
  const params = new URLSearchParams();
  if (state.query.trim()) params.set("q", state.query.trim());
  for (const key of ["moveIn", "moveOut", "selected"] as const) if (state[key]) params.set(key, state[key]);
  for (const key of ["priceMin", "priceMax", "beds"] as const) if (state[key]) params.set(key, String(state[key]));
  if (state.amenities.length) params.set("amenities", state.amenities.join(","));
  if (state.sort !== "recommended") params.set("sort", state.sort);
  if (state.view !== "split") params.set("view", state.view);
  if (state.page > 1) params.set("page", String(state.page));
  if (state.bounds) params.set("bbox", formatMapBounds(state.bounds));
  return `/search${params.size ? `?${params}` : ""}`;
}

export function searchCatalog(listings: PreviewListing[], state: SearchState, pageSize = 24, matchScore?: (listing: PreviewListing) => number | undefined) {
  const candidates = listings.filter((listing) =>
    listing.beds >= state.beds &&
    state.amenities.every((amenity) => matchesListingAmenity(listing, amenity)) &&
    (!state.moveIn || Boolean(listing.availableFrom && listing.availableFrom <= state.moveIn)) &&
    (!state.moveOut || Boolean(listing.availableTo && listing.availableTo >= state.moveOut)) &&
    !(state.moveIn && state.moveOut && state.moveOut <= state.moveIn)
  );
  return buildCatalogPage(candidates, {
    query: state.query, checkIn: state.moveIn, checkOut: state.moveOut, amenity: "全部",
    priceMin: state.priceMin, priceMax: state.priceMax || Number.MAX_SAFE_INTEGER,
    sort: state.sort, page: state.page, pageSize, bounds: state.bounds
  }, matchScore);
}

export function searchDateError(moveIn: string, moveOut: string) {
  if (Boolean(moveIn) !== Boolean(moveOut)) return "请选择完整的入住和退租日期，或清除日期灵活找房。";
  if (moveIn && moveOut <= moveIn) return "退租日期需要晚于入住日期。";
  return "";
}

const openedSearchKey = "sublet:last-search";

/** Remembers, in this tab, the search a listing was opened from: its page links back there and scores the match as the card did. */
export function rememberOpenedSearch(state: SearchState, listingId: string) {
  try { sessionStorage.setItem(openedSearchKey, searchHref({ ...state, selected: listingId })); } catch { /* Browsing still works when storage is unavailable. */ }
}

export function openedSearchHref() {
  try {
    const value = sessionStorage.getItem(openedSearchKey);
    return value === "/search" || value?.startsWith("/search?") ? value : "/search";
  } catch {
    return "/search";
  }
}

function positiveNumber(value: string | null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(1_000_000, Math.floor(number)) : 0;
}

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
}
