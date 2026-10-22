import { interestSimilarity, listingSimilarity, type ListingMatch } from "./listing-match";
import { isListingBookable, localDate } from "./listing-stay";
import type { PreviewListing } from "./preview-data";
import { searchCatalog, type SearchState } from "./search-state";

/**
 * Listing feeds: 为你推荐, 最近浏览 and 新上架 on the home page, 相似房源 on a listing page.
 * How well a listing fits the renter is the match score and similarity from lib/listing-match.ts;
 * this module only decides what is eligible, adds freshness and keeps a row from repeating one neighborhood.
 */
export type FeedItem = { listing: PreviewListing; match: ListingMatch | null };

const dayMs = 86_400_000;
/** A listing counts as new for two weeks after it was listed, and its freshness halves over the same period. */
const freshDays = 14;
/** Below this a same-city listing shares little more than the city (see listingSimilarity's weights). */
const minSimilarity = 0.3;

/** Homes the renter opened or saved say the most about taste; the latest ten of each are enough. */
export function interestListings(listings: readonly PreviewListing[], savedIds: readonly string[], viewedIds: readonly string[]) {
  const byId = new Map(listings.map((listing) => [listing.id, listing]));
  const ids = new Set([...viewedIds.slice(0, 10), ...savedIds.slice(-10)]);
  return [...ids].flatMap((id) => byId.get(id) ?? []);
}

/**
 * With a last search, 为你推荐 and 新上架 continue it: only its results, scored by `matches` for that search.
 * Homes saved or opened before the page loaded (`seenIds`) come back only when nothing else is left.
 */
export function buildHomeFeeds(listings: readonly PreviewListing[], { matches, interest, seenIds, viewedIds, search, now }: {
  /** Match per listing id (components/marketplace/use-listing-matches.ts, for `search`). */
  matches: ReadonlyMap<string, ListingMatch | null>;
  /** interestListings() as the page loaded. */
  interest: readonly PreviewListing[];
  seenIds: ReadonlySet<string>;
  /** Newest first, as stored now: 最近浏览 follows 清除记录 at once. */
  viewedIds: readonly string[];
  search: SearchState | null;
  now: number;
}) {
  const withMatch = (listing: PreviewListing): FeedItem => ({ listing, match: matches.get(listing.id) ?? null });
  const results = feedCandidates(listings, search, now);
  const unseen = results.filter((listing) => !seenIds.has(listing.id));
  const pool = unseen.length ? unseen : results;

  const scored = pool.map((listing) => {
    const item = withMatch(listing);
    // Saved and viewed homes always count, even when every match is 100 (as after a city-only search).
    const taste = interest.length ? interestSimilarity(listing, interest) : 0;
    const fit = item.match ? item.match.score / 100 : 0.5;
    return { ...item, relevance: 0.6 * fit + 0.25 * taste + 0.15 * 0.5 ** (ageInDays(listing, now) / freshDays) };
  });
  const forYou = diversify(scored, 8);
  const shown = new Set(forYou.map((item) => item.listing.id));
  const byId = new Map(listings.map((listing) => [listing.id, listing]));

  return {
    forYou,
    /** False until there is a search, a match, or a saved or viewed home to go on; the row is then 精选房源. */
    personalized: Boolean(search) || interest.length > 0 || scored.some((item) => item.match),
    recent: viewedIds.flatMap((id) => byId.get(id) ?? []).slice(0, 4).map(withMatch),
    fresh: pool
      .filter((listing) => !shown.has(listing.id) && ageInDays(listing, now) <= freshDays)
      .sort((left, right) => ageInDays(left, now) - ageInDays(right, now))
      .slice(0, 4)
      .map(withMatch)
  };
}

/** Bookable homes, narrowed to the search's results when there is one. */
export function feedCandidates(listings: readonly PreviewListing[], search: SearchState | null, now: number) {
  const today = localDate(new Date(now));
  const bookable = listings.filter((listing) => isListingBookable(listing, today));
  return search ? searchCatalog(bookable, search, Number.MAX_SAFE_INTEGER).items : bookable;
}

/** 相似房源: up to four bookable listings in the same city that are close in neighborhood, rent, rooms or tags. */
export function similarListings(target: PreviewListing, listings: readonly PreviewListing[], today = localDate()) {
  return listings
    .filter((listing) => listing.id !== target.id && isListingBookable(listing, today))
    .map((listing) => ({ listing, similarity: listingSimilarity(target, listing) }))
    .filter(({ similarity }) => similarity >= minSimilarity)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 4)
    .map(({ listing }) => listing);
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
