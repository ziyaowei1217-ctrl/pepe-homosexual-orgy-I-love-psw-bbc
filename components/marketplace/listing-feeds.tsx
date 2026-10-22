"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { ListingCard } from "@/components/marketplace/listing-card";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useListingMatches } from "@/components/marketplace/use-listing-matches";
import { forgetListingViews, lastSearchState, useFeedSignals } from "@/lib/feed-signals";
import { buildHomeFeeds, similarListings, type FeedItem } from "@/lib/listing-feeds";
import type { ListingMatch } from "@/lib/listing-match";
import { listingHref, localDate, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { defaultSearch, rememberOpenedSearch, searchCatalog, searchDateError, searchHref } from "@/lib/search-state";
import { cn } from "@/lib/utils";

/** Home page rows: 为你推荐 (精选房源 until there is anything to go on), 最近浏览 and 新上架. */
export function HomeFeeds({ listings, now }: { listings: PreviewListing[]; now: number }) {
  const { viewedIds, lastSearch } = useFeedSignals();
  // A last search that no longer finds anything stops steering the page.
  const search = useMemo(() => {
    const state = lastSearchState(lastSearch, localDate(new Date(now)));
    return state && searchCatalog(listings, state, 1).total ? state : null;
  }, [lastSearch, listings, now]);
  const { matches, interest, seenIds } = useListingMatches(listings, search ?? defaultSearch);
  const feeds = useMemo(
    () => buildHomeFeeds(listings, { matches, interest, seenIds, viewedIds, search, now }),
    [interest, listings, matches, now, search, seenIds, viewedIds]
  );
  // Cards from the last search price its dates and open the listing as a card on that search would.
  const stay = search?.moveIn && !searchDateError(search.moveIn, search.moveOut) ? { moveIn: search.moveIn, moveOut: search.moveOut } : undefined;
  const openFromSearch = search ? (listingId: string) => rememberOpenedSearch(search, listingId) : undefined;

  if (!feeds.forYou.length && !feeds.recent.length && !feeds.fresh.length) {
    return <p className="rounded-psw-xl bg-surface p-8 text-center text-d-subhead text-ink-secondary">新房源正在准备中，可以先选择感兴趣的城市。</p>;
  }
  return <>
    {feeds.forYou.length ? <FeedSection
      id="home-picks"
      title={feeds.personalized ? "为你推荐" : "精选房源"}
      description={search
        ? `上次搜索${search.query.trim() ? `「${search.query.trim()}」` : ""}的结果，按匹配偏好、收藏和浏览记录排序。`
        : feeds.personalized ? "按匹配偏好、收藏和浏览记录排序。" : "按月租显示。选好日期后，卡片上会换成你那段日期的总价。"}
      action={search
        ? <MoreLink href={searchHref(search)}>查看上次搜索</MoreLink>
        : <MoreLink href="/search">查看全部 {listings.length.toLocaleString("en-US")} 套</MoreLink>}
      items={feeds.forYou}
      stay={stay}
      onOpen={openFromSearch}
      priority
    /> : null}
    {feeds.recent.length ? <FeedSection
      id="home-recent"
      title="最近浏览"
      action={<button
        type="button"
        onClick={() => {
          forgetListingViews();
          // The row and this button go away; keep keyboard focus on the page.
          document.getElementById("home-picks")?.focus();
        }}
        className="flex min-h-11 items-center rounded-full px-1 font-rounded text-d-label text-ink-secondary hover:text-ink"
      >清除记录</button>}
      items={feeds.recent}
    /> : null}
    {feeds.fresh.length ? <FeedSection
      id="home-new"
      title="新上架"
      description={search ? "两周内上架、符合上次搜索的房源。" : "两周内上架的房源。"}
      items={feeds.fresh}
      stay={stay}
      onOpen={openFromSearch}
    /> : null}
  </>;
}

/** 相似房源 at the bottom of a listing page, with the same matches the page scored for its own block. */
export function SimilarListings({ listing, listings, matches, className }: {
  listing: PreviewListing; listings: readonly PreviewListing[]; matches: ReadonlyMap<string, ListingMatch | null>; className?: string;
}) {
  const similar = useMemo(() => similarListings(listing, listings), [listing, listings]);
  if (!similar.length) return null;
  return <FeedSection
    id="listing-similar"
    title="相似房源"
    description="同城，地段、租金或房型接近，还有可订日期。"
    items={similar.map((item) => ({ listing: item, match: matches.get(item.id) ?? null }))}
    className={className}
  />;
}

function FeedSection({ id, title, description, action, items, stay, onOpen, priority = false, className }: {
  id: string; title: string; description?: string; action?: ReactNode; items: FeedItem[];
  stay?: ListingStay; onOpen?: (listingId: string) => void; priority?: boolean; className?: string;
}) {
  const { savedIds, toggleSaved } = useSavedListings();
  return <section aria-labelledby={id} className={cn("flex min-w-0 flex-col gap-6", className)}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} tabIndex={-1} className="text-[22px] font-bold leading-[30px] text-ink outline-none sm:text-d-title">{title}</h2>
        {description ? <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">{description}</p> : null}
      </div>
      {action}
    </div>
    {/* A swipeable row on phones, like the city pills above it; a grid from sm up. */}
    <div className="-mx-4 -my-2 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 py-2 [scrollbar-width:none] sm:m-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-6 sm:overflow-visible sm:p-0">
      {items.map(({ listing, match }, index) => <ListingCard
        key={listing.id}
        listing={listing}
        match={match}
        href={listingHref(listing.id, stay)}
        moveIn={stay?.moveIn}
        moveOut={stay?.moveOut}
        saved={savedIds.has(listing.id)}
        onToggleSave={() => toggleSaved(listing.id)}
        onOpen={onOpen && (() => onOpen(listing.id))}
        priority={priority && index === 0}
        sizes="(max-width: 640px) 80vw, (max-width: 1200px) 50vw, 25vw"
        className="w-[80%] shrink-0 snap-start sm:w-auto"
      />)}
    </div>
  </section>;
}

function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="flex min-h-11 items-center gap-1 rounded-full px-1 font-rounded text-d-label text-primary-text hover:text-ink">{children}<ArrowRight className="size-4" aria-hidden="true" /></Link>;
}
