import { ArrowRight, CalendarDays, ChevronRight, KeyRound, MapPin, Search, Sofa, Star, TrainFront, UsersRound } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";

import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import type { PreviewListing } from "@/lib/preview-data";

const destinations = ["Los Angeles", "New York", "Boston", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC"];

export function HomeExperience({ listings, totalListings = listings.length, totalCities }: { listings: PreviewListing[]; totalListings?: number; totalCities?: number }) {
  const featured = listings[0];
  const featuredSaving = featured ? featured.originalPrice - featured.price : 0;
  const stats = [
    ...(totalListings ? [{ value: totalListings.toLocaleString("en-US"), label: "套在租房源" }] : []),
    ...(totalCities ? [{ value: String(totalCities), label: "个城市与都会区" }] : []),
    { value: "$0", label: "提交申请时支付" }
  ];
  return <main className="bg-surface-subtle">
    <section className="bg-ink-block text-white">
      <div className="mx-auto max-w-[1520px] px-4 pb-10 pt-10 sm:px-6 lg:px-8 lg:pb-14 lg:pt-20">
        <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
          <div className="min-w-0 py-1">
            <p className="inline-flex items-center gap-2.5 rounded-full border border-surface/20 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-dark-secondary"><span className="size-2 rounded-full bg-surface" />A place for your next chapter</p>
            <h1 className="mt-7 font-slogan text-[46px] font-black leading-[1.12] tracking-[-0.01em] sm:text-[68px] xl:text-[84px]">下一站，<br /><span className="text-accent">住得自在。</span></h1>
            <p className="mt-6 max-w-lg text-base font-medium leading-7 text-on-dark-secondary sm:text-lg">更轻松地找到全美主要城市的下一处住所</p>
            <p className="mt-1 text-sm leading-6 text-on-dark-secondary">从一间合适的房，到一段新的生活。先选城市，再慢慢挑。</p>
            <form action="/search" method="get" aria-label="搜索房源" className="relative z-10 mt-9 rounded-[24px] bg-surface p-2 text-ink shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
              <div className="flex items-center gap-3 rounded-2xl px-3 py-3 focus-within:bg-surface-muted">
                <MapPin className="size-5 shrink-0 text-primary-text" aria-hidden="true" />
                <div className="min-w-0 flex-1"><span className="mb-1 block text-xs font-bold text-ink-secondary">想住在哪里？</span><LocationAutocomplete name="q" defaultValue="Los Angeles" ariaLabel="想住在哪里？" placeholder="城市、学校或公司" inputClassName="text-base font-bold text-ink" /></div>
              </div>
              <div className="flex flex-wrap items-center border-t border-line-strong sm:flex-nowrap">
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><CalendarDays className="size-3.5" />入住</span><input type="date" name="moveIn" aria-label="入住日期" className="w-full min-w-0 bg-transparent text-sm font-semibold text-ink outline-none" /></label>
                <span className="h-9 w-px bg-line-strong" />
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-secondary"><CalendarDays className="size-3.5" />退租</span><input type="date" name="moveOut" aria-label="退租日期" className="w-full min-w-0 bg-transparent text-sm font-semibold text-ink outline-none" /></label>
                <button type="submit" className="mt-1 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-primary px-7 font-rounded text-base font-bold text-white transition-colors hover:bg-primary-hover sm:mt-0 sm:w-auto"><Search className="size-[18px]" />搜索房源</button>
              </div>
            </form>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">{stats.map((stat) => <div key={stat.label}><dt className="sr-only">{stat.label}</dt><dd className="font-display text-[34px] font-bold leading-none sm:text-[40px]">{stat.value}</dd><dd className="mt-1.5 text-xs text-on-dark-secondary sm:text-[13px]">{stat.label}</dd></div>)}</dl>
          </div>
          {featured ? <Link href={`/listing/${encodeURIComponent(featured.id)}`} className="group relative hidden h-[520px] overflow-hidden rounded-[32px] border border-surface/10 bg-ink-block lg:block">
            <SmartImage src={featured.image} alt={featured.title} fill priority sizes="45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            <span className="absolute left-6 top-6 rounded-full bg-surface px-3.5 py-2 text-[13px] font-bold text-ink">发现一个新家</span>
            {featuredSaving > 0 ? <span className="absolute right-6 top-6 rounded-full bg-surface px-3.5 py-2 text-[13px] font-bold text-primary-text">比原价低 ${featuredSaving.toLocaleString("en-US")}/月</span> : null}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 bg-ink-block p-7 text-white">
              <div className="min-w-0"><p className="flex items-center gap-1.5 text-[13px] text-on-dark-secondary"><MapPin className="size-3.5" />{featured.area}</p><h2 className="mt-2 truncate text-2xl font-bold">{featured.title}</h2><p className="mt-3"><span className="font-display text-[32px] font-bold">${featured.price.toLocaleString("en-US")}</span><span className="ml-1.5 text-sm text-on-dark-secondary">/ 月</span></p></div>
              <span className="grid size-[52px] shrink-0 place-items-center rounded-full bg-surface text-ink transition-transform group-hover:translate-x-1"><ArrowRight className="size-5" /></span>
            </div>
          </Link> : null}
        </div>
        <div className="mt-12 flex items-center gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="热门地点"><span className="mr-2 shrink-0 text-xs font-bold tracking-[0.14em] text-on-dark-secondary">热门城市</span>{destinations.map((destination) => <Link key={destination} href={`/search?q=${encodeURIComponent(destination)}`} className="shrink-0 rounded-full border border-surface/20 px-[18px] py-2.5 text-sm font-medium text-white transition-colors hover:border-surface hover:bg-surface hover:text-ink">{destination}</Link>)}</div>
      </div>
    </section>

    <section className="mx-auto max-w-[1520px] px-4 py-9 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        { icon: Sofa, label: "拎包，开启新生活", detail: "带家具的房源", amenity: "带家具" },
        { icon: TrainFront, label: "把通勤变短一点", detail: "地铁附近的房源", amenity: "近地铁" },
        { icon: KeyRound, label: "留一点自己的空间", detail: "带独卫的房源", amenity: "独卫" },
        { icon: UsersRound, label: "和毛孩子一起住", detail: "宠物友好房源", amenity: "宠物" }
      ].map(({ icon: Icon, label, detail, amenity }) => <Link key={amenity} href={`/search?amenities=${encodeURIComponent(amenity)}`} className="group flex items-center gap-3 rounded-[20px] border border-line-strong bg-surface px-3 py-4 transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary-soft-pressed sm:gap-4 sm:p-5"><span className="grid size-12 shrink-0 place-items-center rounded-[14px] bg-primary-soft text-primary-text transition-colors group-hover:bg-primary group-hover:text-white"><Icon className="size-[22px]" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-sm font-bold text-ink sm:text-base">{label}</span><span className="mt-1 block text-xs text-ink-secondary sm:text-[13px]">{detail}</span></span><ChevronRight className="ml-auto hidden size-4 text-ink-placeholder xl:block" /></Link>)}</div>
      <div className="mt-14 flex items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.16em] text-primary-text">精选房源</p><h2 className="mt-2.5 text-3xl font-black tracking-[-0.01em] text-ink sm:text-[44px] sm:leading-tight">为下一段生活，找个落脚点</h2><p className="mt-2.5 text-[15px] text-ink-secondary">看看这些房源，从位置、月租和租期开始比较。</p></div><Link href="/search" className="secondary-action hidden whitespace-nowrap sm:inline-flex">查看全部{totalListings ? ` ${totalListings.toLocaleString("en-US")} 套` : ""} <ArrowRight className="size-4" /></Link></div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing, index) => <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`} className="group min-w-0 overflow-hidden rounded-psw-xl border border-line-strong bg-surface transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-outline hover:shadow-[0_22px_44px_rgba(29,22,64,0.12)]"><div className="relative aspect-[1.4] overflow-hidden bg-primary-soft"><SmartImage src={listing.image} alt={listing.title} fill priority={index === 0} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.04]" />{listing.originalPrice > listing.price ? <span className="absolute left-3.5 top-3.5 rounded-full bg-surface px-3 py-1.5 text-xs font-bold text-primary-text">比原价低 ${(listing.originalPrice - listing.price).toLocaleString("en-US")}</span> : null}</div><div className="p-5"><div className="flex items-baseline justify-between gap-2"><p><span className="font-display text-[28px] font-extrabold leading-none text-primary-text">${listing.price.toLocaleString("en-US")}</span><span className="ml-1 text-[13px] text-ink-secondary">/ 月</span></p><span className="font-display flex items-center gap-1 text-sm font-semibold"><Star className="size-3.5 fill-ink" aria-hidden="true" />{listing.score}</span></div><h3 className="mt-2.5 truncate text-base font-bold text-ink">{listing.title}</h3><p className="mt-1 truncate text-[13px] text-ink-secondary">{listing.area}</p><div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4"><span className="rounded-lg bg-tag-neutral px-2.5 py-1 text-xs font-semibold text-ink-secondary">{listing.beds} 卧 · {listing.baths} 卫</span>{listing.tags.slice(0, 2).map((tag) => <span key={tag} className="rounded-lg bg-tag-neutral px-2.5 py-1 text-xs font-semibold text-ink-secondary">{tag}</span>)}</div></div></Link>)}</div>
      {!listings.length ? <p className="mt-6 rounded-2xl bg-surface-muted p-8 text-center text-sm text-ink-secondary">新房源正在准备中，可以先选择感兴趣的城市。</p> : null}
      <Link href="/search" className="secondary-action mt-8 flex w-full sm:hidden">查看全部房源 <ArrowRight className="size-4" /></Link>
    </section>
    <section className="mx-auto max-w-[1520px] px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pb-20"><div className="grid gap-8 rounded-[32px] bg-ink-block p-7 text-white sm:p-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:gap-12"><div><p className="text-xs font-bold tracking-[0.16em] text-on-dark-secondary">安心开始，不用着急决定</p><h2 className="mt-3 text-balance text-3xl font-black tracking-[-0.01em] sm:text-[38px] sm:leading-tight">先喜欢，再了解，最后安顿。</h2><Link href="/roommates" className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-full bg-surface px-6 text-[15px] font-bold text-ink transition-colors hover:bg-primary-soft">也在找合拍的室友？ <ArrowRight className="size-4" /></Link></div><ol className="grid gap-4 sm:grid-cols-3">{[["01", "发现与比较", "按位置、月租与租期缩小范围。"], ["02", "沟通与看房", "联系房东，把在意的细节问清楚。"], ["03", "提交申请", "房东接受申请后，再进入付款。"]].map(([number, title, detail]) => <li key={number} className="rounded-[22px] border border-surface/[0.12] p-6"><span className="font-display text-[44px] font-bold leading-none text-on-dark-secondary">{number}</span><h3 className="mt-4 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-7 text-on-dark-secondary">{detail}</p></li>)}</ol></div></section>
  </main>;
}
