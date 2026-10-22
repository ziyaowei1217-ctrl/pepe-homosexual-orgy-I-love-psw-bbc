"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { ListingCard } from "@/components/marketplace/listing-card";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useFeedSignals } from "@/components/marketplace/use-feed-signals";
import { useListingMatches } from "@/components/marketplace/use-listing-matches";
import { lastSearchState } from "@/lib/feed-signals";
import { buildHomeFeeds, similarListings, type FeedItem } from "@/lib/listing-feeds";
import type { ListingMatch } from "@/lib/listing-match";
import { listingHref, localDate } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { defaultSearch, searchHref } from "@/lib/search-state";
import { cn } from "@/lib/utils";

/** Home page rows: 为你推荐 (精选房源 until there is anything to go on), 最近浏览 and 新上架. */
export function HomeFeeds({ listings, totalListings, now }: { listings: PreviewListing[]; totalListings: number; now: number }) {
  const { savedIds } = useSavedListings();
  const { signals, clearViewed } = useFeedSignals();
  const search = useMemo(() => lastSearchState(signals, localDate(new Date(now))), [now, signals]);
  const { matches, interest } = useListingMatches(listings, search ?? defaultSearch);
  const feeds = useMemo(
    () => buildHomeFeeds(listings, { matches, interest, savedIds: [...savedIds], viewedIds: signals.viewedIds, search, now }),
    [interest, listings, matches, now, savedIds, search, signals.viewedIds]
  );

  if (!listings.length) {
    return <p className="rounded-psw-xl bg-surface p-8 text-center text-d-subhead text-ink-secondary">新房源正在准备中，可以先选择感兴趣的城市。</p>;
  }
  return <>
    <FeedSection
      id="home-picks"
      title={feeds.personalized ? "为你推荐" : "精选房源"}
      description={feeds.personalized ? "按你的找房条件、收藏和浏览过的房源排序。" : "按月租显示。选好日期后，卡片上会换成你那段日期的总价。"}
      action={<MoreLink href="/search">查看全部{totalListings ? ` ${totalListings.toLocaleString("en-US")} 套` : ""}</MoreLink>}
      items={feeds.forYou}
      priority
    />
    {feeds.recent.length ? <FeedSection
      id="home-recent"
      title="最近浏览"
      action={<button type="button" onClick={clearViewed} className="flex min-h-11 items-center rounded-full px-1 font-rounded text-d-label text-ink-secondary hover:text-ink">清除记录</button>}
      items={feeds.recent}
    /> : null}
    {feeds.fresh.length ? <FeedSection
      id="home-new"
      title="新上架"
      description={search ? "两周内上架、符合你上次搜索的房源。" : "两周内上架的房源。"}
      action={<MoreLink href={search ? searchHref(search) : "/search"}>{search ? "查看这次搜索" : "查看全部"}</MoreLink>}
      items={feeds.fresh}
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
    description="同城、价格和条件接近，日期还能订。"
    items={similar.map((item) => ({ listing: item, match: matches.get(item.id) ?? null }))}
    className={className}
  />;
}

function FeedSection({ id, title, description, action, items, priority = false, className }: {
  id: string; title: string; description?: string; action?: ReactNode; items: FeedItem[]; priority?: boolean; className?: string;
}) {
  const { savedIds, toggleSaved } = useSavedListings();
  return <section aria-labelledby={id} className={cn("flex flex-col gap-6", className)}>
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h2 id={id} className="text-[22px] font-bold leading-[30px] text-ink sm:text-d-title">{title}</h2>
        {description ? <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">{description}</p> : null}
      </div>
      {action}
    </div>
    {/* A swipeable row on phones, like the city pills above it; a grid from sm up. */}
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0">
      {items.map(({ listing, match }, index) => <ListingCard
        key={listing.id}
        listing={listing}
        match={match}
        href={listingHref(listing.id)}
        saved={savedIds.has(listing.id)}
        onToggleSave={() => toggleSaved(listing.id)}
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
