import { listingSimilarity, type ListingMatch } from "./listing-match";
import { earliestListingDate, localDate } from "./listing-stay";
import type { PreviewListing } from "./preview-data";
import { defaultSearch, searchCatalog, type SearchState } from "./search-state";

/**
 * Listing feeds: 为你推荐, 最近浏览 and 新上架 on the home page, 相似房源 on a listing page.
 * How well a listing fits the renter is the match score and similarity from lib/listing-match.ts;
 * this module only decides what is eligible, adds freshness and keeps a row from repeating one neighborhood.
 */
export type FeedItem = { listing: PreviewListing; match: ListingMatch | null };

export type HomeFeeds = {
  forYou: FeedItem[];
  /** False until the renter has preferences, a search, saved homes or viewed homes; the row is then 精选房源. */
  personalized: boolean;
  recent: FeedItem[];
  fresh: FeedItem[];
};

const dayMs = 86_400_000;
/** A listing counts as new for two weeks after it went live, and its freshness halves over the same period. */
const freshDays = 14;

/** Homes the renter opened or saved say the most about taste; the latest ten of each are enough. */
export function interestListings(listings: readonly PreviewListing[], savedIds: readonly string[], viewedIds: readonly string[]) {
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const ids = new Set([...viewedIds.slice(0, 10), ...savedIds.slice(-10)]);
  return [...ids].flatMap((id) => byId.get(id) ?? []);
}

export function buildHomeFeeds(listings: PreviewListing[], { matches, interest, savedIds, viewedIds, search, now }: {
  /** Match per listing id (components/marketplace/use-listing-matches.ts, with the last search applied). */
  matches: ReadonlyMap<string, ListingMatch | null>;
  /** interestListings(): viewed homes first, then saved ones. */
  interest: readonly PreviewListing[];
  savedIds: readonly string[];
  /** Newest first. */
  viewedIds: readonly string[];
  search: SearchState | null;
  now: number;
}): HomeFeeds {
  const today = localDate(new Date(now));
  const seen = new Set([...savedIds, ...viewedIds]);
  const withMatch = (listing: PreviewListing): FeedItem => ({ listing, match: matches.get(listing.id) ?? null });
  const unseen = listings.filter((listing) => !seen.has(listing.id) && isBookable(listing, today));

  // A city search is a hard limit, as on the search page; the rest of the search only shapes the match score.
  const inPlace = search?.query.trim() ? new Set(searchCatalog(unseen, { ...defaultSearch, query: search.query }, Number.MAX_SAFE_INTEGER).items) : null;
  const pool = inPlace?.size ? unseen.filter((listing) => inPlace.has(listing)) : unseen;
  const scored = pool.map((listing) => {
    const item = withMatch(listing);
    // Without stated preferences there is no match score, but saved and viewed homes still point the way.
    const fit = item.match ? item.match.score / 100
      : interest.length ? Math.max(...interest.map((home) => listingSimilarity(listing, home))) : 0.5;
    return { ...item, relevance: 0.8 * fit + 0.2 * 0.5 ** (ageInDays(listing, now) / freshDays) };
  });
  const forYou = diversify(scored, 8);
  const shown = new Set(forYou.map((item) => item.listing.id));
  const fresh = (search ? searchCatalog(unseen, search, Number.MAX_SAFE_INTEGER).items : unseen)
    .filter((listing) => !shown.has(listing.id) && ageInDays(listing, now) <= freshDays)
    .sort((left, right) => ageInDays(left, now) - ageInDays(right, now))
    .slice(0, 4)
    .map(withMatch);
  const viewed = new Set(viewedIds);

  return {
    forYou,
    personalized: interest.length > 0 || scored.some((item) => item.match),
    // interestListings keeps viewed homes first, newest first.
    recent: interest.filter((listing) => viewed.has(listing.id)).slice(0, 4).map(withMatch),
    fresh
  };
}

/** 相似房源: bookable listings most like the open one; listingSimilarity is 0 across cities, so those drop out. */
export function similarListings(target: PreviewListing, listings: readonly PreviewListing[], { limit = 4, today = localDate() } = {}) {
  return listings
    .filter((listing) => listing.id !== target.id && isBookable(listing, today))
    .map((listing) => ({ listing, similarity: listingSimilarity(target, listing) }))
    .filter(({ similarity }) => similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map(({ listing }) => listing);
}

/** The same rule as the listing page: some dates are still open after today. */
function isBookable(listing: PreviewListing, today: string) {
  return Boolean(listing.availableFrom && listing.availableTo > earliestListingDate(listing, today));
}

function ageInDays(listing: PreviewListing, now: number) {
  const listedAt = Date.parse(listing.listedAt ?? "");
  return Number.isFinite(listedAt) ? Math.max(0, (now - listedAt) / dayMs) : Number.POSITIVE_INFINITY;
}

/**
 * Maximal marginal relevance: each next card is the best trade-off between its own relevance and how much it
 * repeats the cards already chosen, so eight cards are not eight rooms on one street. Ties keep the catalog order.
 */
function diversify(items: Array<FeedItem & { relevance: number }>, limit: number): FeedItem[] {
  const pool = [...items].sort((left, right) => right.relevance - left.relevance);
  const chosen: FeedItem[] = [];
  while (chosen.length < limit && pool.length) {
    let best = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    pool.forEach((item, index) => {
      const repeat = Math.max(0, ...chosen.map((card) => listingSimilarity(item.listing, card.listing)));
      const score = 0.7 * item.relevance - 0.3 * repeat;
      if (score > bestScore) [best, bestScore] = [index, score];
    });
    const [{ listing, match }] = pool.splice(best, 1);
    chosen.push({ listing, match });
  }
  return chosen;
}
