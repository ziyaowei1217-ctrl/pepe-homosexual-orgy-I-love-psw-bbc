import { CalendarDays, MapPin, Search } from "lucide-react";
import Link from "next/link";

import { Wowo } from "@/components/brand/wowo";
import { HomeFeeds } from "@/components/marketplace/listing-feeds";
import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import { localDate } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { DateInput } from "@/components/ui/date-input";

// Labels in Chinese; the query stays the catalog's English market name.
const destinations = [
  ["洛杉矶", "Los Angeles"], ["纽约", "New York"], ["波士顿", "Boston"], ["旧金山湾区", "San Francisco Bay Area"],
  ["西雅图", "Seattle"], ["芝加哥", "Chicago"], ["奥斯汀", "Austin"], ["华盛顿特区", "Washington, DC"]
] as const;
const needs = ["带家具", "近地铁", "独卫", "宠物"] as const;

/**
 * psw home, direction A (夜色): one short 夜墨 hero with the slogan and the search, then light content.
 * It is the page's only 夜墨 block, so the booking decision block stays special elsewhere.
 * `listings` is the whole catalog; the feeds (components/marketplace/listing-feeds.tsx) pick what to show.
 */
export function HomeExperience({ listings }: { listings: PreviewListing[] }) {
  const today = localDate();
  return <main className="bg-background">
    <section aria-labelledby="home-title" className="bg-ink-block text-on-dark">
      <div className="page-container flex items-center gap-12 pb-10 pt-8 sm:pb-14 sm:pt-12 lg:py-[72px]">
        <div className="min-w-0 flex-1">
          <div className="flex items-end justify-between gap-4">
            <h1 id="home-title" className="font-slogan text-[44px] font-bold leading-[1.18] sm:text-[64px] lg:text-[76px] lg:leading-[1.16]">
              <span className="block">下一站，</span><span className="block text-accent">住得自在。</span>
            </h1>
            <span aria-hidden="true" className="mb-1 grid size-24 shrink-0 place-items-center rounded-full bg-peach-100 lg:hidden"><Wowo size={72} /></span>
          </div>
          <p className="mt-4 text-m-subhead text-on-dark-secondary sm:mt-6 sm:leading-7">留学生之间的转租。选好日期，总价一次算清。</p>
          <form action="/search" method="get" aria-label="搜索房源" className="relative z-10 mt-6 flex flex-col gap-1 rounded-psw-xl bg-surface p-2 text-ink shadow-search sm:mt-8 lg:max-w-[720px] lg:flex-row lg:items-center lg:rounded-full lg:p-2 lg:pl-3">
            <label className="field-shell flex min-w-0 flex-1 items-center gap-3 rounded-full px-3 py-2 focus-within:bg-surface-subtle lg:flex-1">
              <MapPin className="size-5 shrink-0 text-primary-text" aria-hidden="true" />
              <span className="min-w-0 flex-1"><span className="block text-m-footnote font-bold text-ink">城市</span><LocationAutocomplete name="q" ariaLabel="想住在哪里？" placeholder="城市、学校或公司" inputClassName="text-base font-semibold text-ink lg:text-sm" /></span>
            </label>
            <span className="hidden h-8 w-px bg-line-strong lg:block" aria-hidden="true" />
            <div className="grid grid-cols-2 gap-1 border-t border-line-strong pt-1 lg:flex lg:flex-[1.25] lg:border-0 lg:pt-0">
              <label className="field-shell min-w-0 cursor-pointer rounded-full px-3 py-2 focus-within:bg-surface-subtle lg:flex-1"><span className="flex items-center gap-1.5 text-m-footnote font-bold text-ink"><CalendarDays className="size-3.5" aria-hidden="true" />入住</span><DateInput name="moveIn" min={today} aria-label="入住日期" focusOutline={false} placeholder="哪天搬进去" wrapperClassName="mt-0.5" className="text-base font-semibold text-ink lg:text-sm" /></label>
              <label className="field-shell min-w-0 cursor-pointer rounded-full px-3 py-2 focus-within:bg-surface-subtle lg:flex-1"><span className="flex items-center gap-1.5 text-m-footnote font-bold text-ink"><CalendarDays className="size-3.5" aria-hidden="true" />退租</span><DateInput name="moveOut" min={today} aria-label="退租日期" focusOutline={false} placeholder="哪天搬走" wrapperClassName="mt-0.5" className="text-base font-semibold text-ink lg:text-sm" /></label>
            </div>
            <button type="submit" className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97] lg:min-h-12 lg:shrink-0"><Search className="size-[18px]" aria-hidden="true" />搜索房源</button>
          </form>
        </div>
        <div aria-hidden="true" className="hidden size-[320px] shrink-0 place-items-center rounded-full bg-peach-100 lg:grid"><Wowo size={220} /></div>
      </div>
    </section>

    <div className="page-container flex flex-col gap-12 pb-16 pt-10 sm:pt-12">
      {/* Cities and conditions sit side by side on wide screens instead of two half-empty rows. */}
      <section aria-labelledby="home-start" className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-12">
        <h2 id="home-start" className="sr-only">从这里开始</h2>
        <div className="flex flex-col gap-3">
          <h3 className="text-m-headline text-ink sm:text-d-headline">热门城市</h3>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">{destinations.map(([label, query]) => <Link key={query} href={`/search?q=${encodeURIComponent(query)}`} className="search-pill hover:border-primary hover:text-primary-text">{label}</Link>)}</div>
        </div>
        <div className="flex flex-col gap-3">
          <h3 className="text-m-headline text-ink sm:text-d-headline">想要的条件</h3>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">{needs.map((need) => <Link key={need} href={`/search?amenities=${encodeURIComponent(need)}`} className="search-pill hover:border-primary hover:text-primary-text">{need === "宠物" ? "可以养宠物" : need}</Link>)}</div>
        </div>
      </section>

      <HomeFeeds listings={listings} now={Date.now()} />

      <section aria-labelledby="home-post" className="flex flex-col items-start gap-6 rounded-psw-2xl bg-primary-soft p-6 sm:flex-row sm:items-center sm:gap-10 sm:px-10 sm:py-8">
        <Wowo size={88} />
        <div className="min-w-0 flex-1">
          <p className="text-d-subhead text-ink-secondary">寒暑假要回国？</p>
          <h2 id="home-post" className="mt-0.5 text-[22px] font-bold leading-[30px] text-primary-text sm:text-d-title">把房间挂出来，别让空房白交房租</h2>
          <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">填好可租日期和月租，声明房东知情，平台审核通过后就会出现在搜索里。</p>
        </div>
        <Link href="/host/listings/new" className="flex min-h-12 shrink-0 items-center justify-center rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97]">发布我的房间</Link>
      </section>
    </div>
  </main>;
}
