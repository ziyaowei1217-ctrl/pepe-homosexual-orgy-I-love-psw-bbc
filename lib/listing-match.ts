import { formatDateShort } from "./date-format";
import { matchesListingAmenity } from "./listing-catalog";
import { getListingCoordinates, type MapPoint } from "./listing-map";
import type { PreviewListing } from "./preview-data";
import type { RenterPreferences } from "./renter-preferences";
import { formatUsd, stayDays } from "./stay-price";
import { findUSMarketByArea, usMarkets, type USMarket } from "./us-market-catalog";

/**
 * Property matching: how well a listing fits one renter, as a 0–100 score with plain reasons and gaps.
 * Pure and synchronous, so search, the home feed and the listing page all rank with the same numbers.
 *
 * Each signal the renter has given is scored 0–1 and weighted; signals they have not given are left out
 * rather than guessed. The host's self-set rating is not used.
 */
export type MatchableListing = Pick<
  PreviewListing,
  "id" | "area" | "price" | "beds" | "tags" | "commute" | "transit" | "availableFrom" | "availableTo"
> & Partial<Pick<PreviewListing, "latitude" | "longitude">>;

export type ListingMatch = {
  /** 0–100. */
  score: number;
  /** What fits, most important first. */
  reasons: string[];
  /** What does not fit, most important first. */
  gaps: string[];
};

export type MatchContext = {
  /** Listings the renter saved or opened; listings like them rank higher. */
  interest?: readonly MatchableListing[];
};

type Signal = { weight: number; fit: number; reason?: string; gap?: string };
type Destination = { label: string; names: string[]; market?: USMarket; point?: MapPoint };

const weights = { location: 25, budget: 30, dates: 25, mustHave: 10, beds: 10, interest: 10 };

/** Campuses and employers with known coordinates, in the markets whose neighborhoods have real map points. */
const places: Array<{ label: string; aliases: string[]; marketId: string; point: MapPoint }> = [
  { label: "UCLA", aliases: ["加州大学洛杉矶分校"], marketId: "los-angeles", point: { lat: 34.0689, lng: -118.4452 } },
  { label: "USC", aliases: ["南加大", "南加州大学", "university of southern california"], marketId: "los-angeles", point: { lat: 34.0224, lng: -118.2851 } },
  { label: "Caltech", aliases: ["加州理工"], marketId: "los-angeles", point: { lat: 34.1377, lng: -118.1253 } },
  { label: "SpaceX", aliases: [], marketId: "los-angeles", point: { lat: 33.9207, lng: -118.328 } },
  { label: "Harvard", aliases: ["哈佛"], marketId: "boston", point: { lat: 42.377, lng: -71.1167 } },
  { label: "MIT", aliases: ["麻省理工"], marketId: "boston", point: { lat: 42.3601, lng: -71.0942 } },
  { label: "Boston University", aliases: ["bu", "波士顿大学"], marketId: "boston", point: { lat: 42.3505, lng: -71.1054 } },
  { label: "Northeastern", aliases: ["东北大学"], marketId: "boston", point: { lat: 42.3398, lng: -71.0892 } }
];

/** Destinations to suggest while typing: the campuses above plus every market's schools and employers. */
export const destinationSuggestions = [...new Set([...places.map((place) => place.label), ...usMarkets.flatMap((market) => market.highlights)])];

export function scoreListingMatch(listing: MatchableListing, preferences: RenterPreferences, context: MatchContext = {}): ListingMatch | null {
  return createMatcher(preferences, context)(listing);
}

/** Highest score first; listings without a match keep their order at the end. Ties go to the lower rent. */
export function rankListingsByMatch<T extends MatchableListing>(
  listings: readonly T[],
  preferences: RenterPreferences,
  context: MatchContext = {}
): Array<{ listing: T; match: ListingMatch | null }> {
  const match = createMatcher(preferences, context);
  return listings
    .map((listing, index) => ({ listing, match: match(listing), index }))
    .sort((left, right) =>
      (right.match?.score ?? -1) - (left.match?.score ?? -1) ||
      (left.match && right.match ? left.listing.price - right.listing.price : 0) ||
      left.index - right.index
    )
    .map(({ listing, match: result }) => ({ listing, match: result }));
}

/**
 * 0–1: same city first, then the same neighborhood, a rent within 30%, bedrooms and shared tags.
 * Listings in different cities are never similar.
 */
export function listingSimilarity(left: MatchableListing, right: MatchableListing) {
  if (city(left.area) !== city(right.area)) return 0;
  const neighborhood = neighborhoodOf(left.area) === neighborhoodOf(right.area) ? 1 : 0;
  const rent = Math.max(0, 1 - Math.abs(left.price - right.price) / (0.3 * Math.max(left.price, right.price, 1)));
  const bedrooms = left.beds === right.beds ? 1 : Math.abs(left.beds - right.beds) === 1 ? 0.5 : 0;
  const leftTags = new Set(left.tags);
  const shared = right.tags.filter((tag) => leftTags.has(tag)).length;
  const union = new Set([...left.tags, ...right.tags]).size;
  return round2(0.35 * neighborhood + 0.35 * rent + 0.1 * bedrooms + 0.2 * (union ? shared / union : 0));
}

function createMatcher(preferences: RenterPreferences, context: MatchContext) {
  const destination = resolveDestination(preferences.destination);
  const interest = context.interest ?? [];
  return (listing: MatchableListing): ListingMatch | null => {
    const stated = [
      destination ? locationSignal(listing, destination) : null,
      preferences.budgetMax ? budgetSignal(listing.price, preferences.budgetMax) : null,
      preferences.moveIn ? dateSignal(listing, preferences.moveIn, preferences.moveOut) : null,
      preferences.mustHave.length ? mustHaveSignal(listing, preferences.mustHave) : null,
      preferences.beds ? bedsSignal(listing.beds, preferences.beds) : null
    ].filter((signal): signal is Signal => signal !== null);
    // Saved and viewed homes refine a match; on their own they are not a preference to score against.
    if (!stated.length) return null;
    const others = interest.filter((item) => item.id !== listing.id);
    const signals = others.length ? [...stated, interestSignal(listing, others)] : stated;
    const total = signals.reduce((sum, signal) => sum + signal.weight, 0);
    return {
      score: Math.round((100 * signals.reduce((sum, signal) => sum + signal.weight * signal.fit, 0)) / total),
      reasons: signals.flatMap((signal) => signal.reason ?? []),
      gaps: signals.flatMap((signal) => signal.gap ?? [])
    };
  };
}

function resolveDestination(value: string): Destination | null {
  const text = value.trim();
  const key = normalize(text);
  if (!key) return null;
  const place = places.find((entry) => normalize(entry.label) === key || entry.aliases.includes(key));
  if (place) {
    return {
      label: place.label,
      names: [normalize(place.label), ...place.aliases],
      market: usMarkets.find((market) => market.id === place.marketId),
      point: place.point
    };
  }
  // A city, neighborhood, school or employer that names exactly one market; ambiguous names (Google,
  // University City) stay city-less.
  const markets = usMarkets.filter((market) =>
    [market.label, ...market.aliases, ...market.highlights, ...market.neighborhoods].some((name) => normalize(name) === key)
  );
  return { label: text, names: [key], market: markets.length === 1 ? markets[0] : undefined };
}

function locationSignal(listing: MatchableListing, destination: Destination): Signal {
  const weight = weights.location;
  const listingMarket = findUSMarketByArea(listing.area);
  const neighborhood = neighborhoodOf(listing.area);
  const commute = [listing.commute, listing.transit]
    .map((text) => ({ text, found: /(\d+)\s*分钟到\s*(.+)$/.exec(text) }))
    .find(({ found }) => found && destination.names.some((name) => mentions(found[2], name)));
  if (commute?.found) {
    const minutes = Number(commute.found[1]);
    const fit = minutes <= 15 ? 1 : Math.max(0.1, 1 - (minutes - 15) / 50);
    return { weight, fit, reason: fit >= 0.6 ? commute.text : undefined, gap: fit < 0.3 ? commute.text : undefined };
  }
  if (destination.names.some((name) => mentions(neighborhood, name))) return { weight, fit: 1, reason: `位于 ${neighborhood}` };
  if (destination.market && listingMarket?.id !== destination.market.id) {
    return { weight, fit: 0, gap: `不在 ${destination.market.label}` };
  }
  if (destination.point && destination.market) {
    const point = Number.isFinite(listing.latitude) && Number.isFinite(listing.longitude)
      ? { lat: listing.latitude as number, lng: listing.longitude as number }
      : getListingCoordinates(listing.area);
    const km = distanceKm(point, destination.point);
    const fit = km <= 2 ? 1 : Math.max(0, 1 - (km - 2) / 18);
    const label = km < 1 ? `距 ${destination.label} 不到 1 公里` : `距 ${destination.label} 约 ${Math.round(km)} 公里`;
    return { weight, fit, reason: fit >= 0.6 ? label : undefined, gap: fit < 0.3 ? label : undefined };
  }
  // The destination is a whole city, or a place we cannot locate: being in that city is all we can tell.
  if (destination.market) return { weight, fit: isCityDestination(destination) ? 1 : 0.5 };
  return { weight, fit: 0.3 };
}

function budgetSignal(price: number, budgetMax: number): Signal {
  const weight = weights.budget;
  if (price <= budgetMax) {
    return { weight, fit: 1, reason: price <= budgetMax * 0.9 ? `比预算低 ${formatUsd(budgetMax - price)}/月` : "在预算内" };
  }
  return { weight, fit: Math.max(0, 1 - (price - budgetMax) / (budgetMax * 0.25)), gap: `超出预算 ${formatUsd(price - budgetMax)}/月` };
}

function dateSignal(listing: MatchableListing, moveIn: string, moveOut: string): Signal {
  const weight = weights.dates;
  const from = listing.availableFrom.slice(0, 10);
  const to = listing.availableTo.slice(0, 10);
  if (!from || !to) return { weight, fit: 0, gap: "可租日期待确认" };
  if (to <= moveIn) return { weight, fit: 0, gap: `${formatDateShort(to)} 后不可租` };
  const lateDays = from > moveIn ? stayDays(moveIn, from) : 0;
  if (!moveOut) {
    return lateDays
      ? { weight, fit: Math.max(0, 1 - lateDays / 30), gap: `${formatDateShort(from)} 才能入住` }
      : { weight, fit: 1, reason: `${formatDateShort(moveIn)} 可入住` };
  }
  const wanted = stayDays(moveIn, moveOut);
  const covered = stayDays(from > moveIn ? from : moveIn, to < moveOut ? to : moveOut);
  if (covered >= wanted) return { weight, fit: 1, reason: "可住满你的日期" };
  const coverage = wanted ? covered / wanted : 0;
  return { weight, fit: coverage * coverage, gap: lateDays ? `${formatDateShort(from)} 才能入住` : `只能住到 ${formatDateShort(to)}` };
}

function mustHaveSignal(listing: MatchableListing, mustHave: string[]): Signal {
  const present = mustHave.filter((amenity) => matchesListingAmenity(listing, amenity));
  const missing = mustHave.filter((amenity) => !present.includes(amenity));
  return {
    weight: weights.mustHave,
    fit: present.length / mustHave.length,
    reason: present.length ? `有 ${present.join("、")}` : undefined,
    gap: missing.length ? `没有 ${missing.join("、")}` : undefined
  };
}

function bedsSignal(beds: number, wanted: number): Signal {
  const weight = weights.beds;
  if (beds >= wanted) return { weight, fit: 1, reason: `${beds} 间卧室` };
  return { weight, fit: wanted - beds === 1 ? 0.4 : 0, gap: `少 ${wanted - beds} 间卧室` };
}

function interestSignal(listing: MatchableListing, interest: readonly MatchableListing[]): Signal {
  const fit = Math.max(...interest.map((item) => listingSimilarity(listing, item)));
  return { weight: weights.interest, fit, reason: fit >= 0.6 ? "和你看过或收藏的房源相似" : undefined };
}

function isCityDestination(destination: Destination) {
  const key = destination.names[0];
  return Boolean(destination.market && [destination.market.label, ...destination.market.aliases].some((name) => normalize(name) === key));
}

/** Whole-word match for Latin names (so "MIT" is not found in "Smith"); substring match for Chinese. */
function mentions(text: string, name: string) {
  const haystack = normalize(text);
  if (!/^[a-z0-9 .&'-]+$/.test(name)) return haystack.includes(name);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(haystack);
}

function distanceKm(from: MapPoint, to: MapPoint) {
  const radians = Math.PI / 180;
  const dLat = (to.lat - from.lat) * radians;
  const dLng = (to.lng - from.lng) * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * radians) * Math.cos(to.lat * radians) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(a));
}

function city(area: string) {
  return normalize(area.split("·")[0] ?? "");
}

function neighborhoodOf(area: string) {
  return (area.split("·")[1] ?? area).trim();
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
