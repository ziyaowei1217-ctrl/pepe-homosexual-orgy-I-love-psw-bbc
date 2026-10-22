"use client";

import { CalendarDays, Heart, MapPin, TrainFront } from "lucide-react";
import Link from "next/link";
import type { HTMLAttributes, Ref } from "react";

import { SmartImage } from "@/components/ui/smart-image";
import { formatRangeShort } from "@/lib/date-format";
import type { ListingMatch } from "@/lib/listing-match";
import { earliestListingDate } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { formatStayLength, formatUsd, stayPrice } from "@/lib/stay-price";
import { cn } from "@/lib/utils";

/**
 * psw ListingCard, the same card on the home page and in search results.
 * Answers "is it worth opening": photo, title, where, commute, the listing's own dates and the price.
 * With valid dates the big number is the rent for exactly those dates; without dates it is the monthly rent.
 * The title link stretches over the whole card; save and map stay separate buttons above it.
 * With a match (lib/listing-match.ts) that can say why, the card shows the score and its biggest gap, or else its first reason.
 */
export function ListingCard({
  listing, href, moveIn = "", moveOut = "", match, saved, onToggleSave, onShowOnMap, onOpen, active = false,
  priority = false, sizes = "(max-width: 640px) 100vw, (max-width: 1200px) 50vw, 25vw", headingLevel = 3, cardRef, className, ...events
}: {
  listing: PreviewListing; href: string; moveIn?: string; moveOut?: string; match?: ListingMatch | null;
  saved?: boolean; onToggleSave?: () => void; onShowOnMap?: () => void; onOpen?: () => void;
  active?: boolean; priority?: boolean; sizes?: string; headingLevel?: 2 | 3; cardRef?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, "children">) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  // The same availability the detail page shows: from today or the listing's start, whichever is later.
  const availableFrom = listing.availableFrom ? earliestListingDate(listing) : "";
  const facts = [`${listing.beds} 卧`, `${listing.baths} 卫`, ...listing.tags.filter((tag) => !tag.includes("入住") && tag !== "房东知情").slice(0, 2)];
  // The commute line below already shows the listing's commute, so the match line skips it.
  const matchNote = match ? [...match.gaps, ...match.reasons].find((note) => note !== listing.commute) : undefined;
  return (
    <article
      ref={cardRef}
      className={cn(
        "group relative flex min-w-0 flex-col rounded-psw-xl bg-surface p-2 pb-4 transition-[box-shadow,transform] duration-200 hover:-translate-y-1 hover:shadow-card-hover",
        active && "ring-2 ring-primary",
        className
      )}
      {...events}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-psw-lg bg-primary-soft">
        <SmartImage src={listing.image} alt={listing.title} fill priority={priority} sizes={sizes} className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {onToggleSave ? <button
          type="button"
          onClick={onToggleSave}
          aria-label={saved ? `取消收藏 ${listing.title}` : `收藏 ${listing.title}`}
          aria-pressed={saved}
          className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-photo-button text-ink transition-transform hover:scale-105 active:scale-[0.97]"
        ><Heart className={cn("size-5", saved && "fill-primary-text text-primary-text")} aria-hidden="true" /></button> : null}
        {onShowOnMap ? <button
          type="button"
          onClick={onShowOnMap}
          className="tap-target absolute bottom-2 right-2 z-10 flex h-8 items-center gap-1 rounded-full bg-photo-button px-3 text-m-footnote font-semibold text-ink lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"
        ><MapPin className="size-3.5" aria-hidden="true" />在地图上查看</button> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-1.5 pt-3">
        <Heading className="text-m-headline sm:text-d-card-title">
          <Link href={href} onClick={onOpen} className="line-clamp-2 text-ink after:absolute after:inset-0 after:rounded-psw-xl after:content-[''] group-hover:text-primary-text">{listing.title}</Link>
        </Heading>
        <p className="truncate text-m-subhead text-ink-secondary sm:text-d-subhead">{listing.area}</p>
        {match && (match.reasons.length || match.gaps.length) ? <p className="flex min-w-0 items-center gap-2"><span className="shrink-0 rounded-psw-sm bg-primary-soft px-2 py-0.5 text-m-footnote font-bold text-primary-text">匹配 <span className="font-display">{match.score}</span>%</span>{matchNote ? <span className="truncate text-m-footnote text-ink-secondary">{matchNote}</span> : null}</p> : null}
        {listing.commute ? <p className="flex items-center gap-1.5 text-m-subhead text-ink-secondary sm:text-d-subhead"><TrainFront className="size-4 shrink-0" aria-hidden="true" /><span className="truncate">{listing.commute}</span></p> : null}
        <p className="truncate text-m-footnote text-ink-secondary">{facts.join(" · ")}</p>
        {availableFrom && listing.availableTo > availableFrom ? <p className="flex items-center gap-1.5 text-m-footnote font-semibold text-ink"><CalendarDays className="size-4 shrink-0" aria-hidden="true" />{formatRangeShort(availableFrom, listing.availableTo)} 可住</p> : null}
        <CardPrice monthly={listing.price} moveIn={moveIn} moveOut={moveOut} />
      </div>
    </article>
  );
}

/** psw card price: the rent for the chosen dates when there are dates, otherwise the monthly rent. */
function CardPrice({ monthly, moveIn, moveOut }: { monthly: number; moveIn: string; moveOut: string }) {
  const price = moveIn && moveOut ? stayPrice(monthly, moveIn, moveOut) : null;
  if (!price) {
    return <p className="mt-auto pt-2"><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{formatUsd(monthly)}</span><span className="ml-1 text-m-footnote text-ink-secondary">/ 月</span></p>;
  }
  return <div className="mt-auto pt-2">
    <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-m-footnote text-ink-secondary">总价</span><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{formatUsd(price.total)}</span><span className="text-m-footnote text-ink-secondary">· {formatStayLength(price)}</span></p>
    <p className="text-m-footnote text-ink-secondary">月租 {formatUsd(monthly)}</p>
  </div>;
}
