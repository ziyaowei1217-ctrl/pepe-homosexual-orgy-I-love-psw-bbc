import { ArrowRight, CalendarDays, ChevronRight, KeyRound, MapPin, Search, Sofa, Star, TrainFront, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import type { PreviewListing } from "@/lib/preview-data";

const destinations = ["Los Angeles", "New York", "Boston", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC"];

export function HomeExperience({ listings }: { listings: PreviewListing[] }) {
  const featured = listings[0];
  return <main className="bg-white">
    <section className="border-b border-slate-200 bg-[#f7f9fc]">
      <div className="mx-auto max-w-[1520px] px-4 pb-8 pt-8 sm:px-6 lg:px-8 lg:pb-10 lg:pt-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_0.85fr] lg:gap-14">
          <div className="py-1 sm:py-5">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"><span className="h-px w-7 bg-[#0668e1]" />A place for your next chapter</p>
            <h1 className="mt-5 text-[42px] font-bold leading-[1.18] tracking-tight text-slate-950 sm:text-[56px] xl:text-[64px]">下一站，<br /><span className="text-[#0668e1]">住得自在。</span></h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-slate-600 sm:text-base">更轻松地找到全美主要城市的下一处住所</p>
            <p className="mt-1 text-sm leading-6 text-slate-500">从一间合适的房，到一段新的生活。先选城市，再慢慢挑。</p>
            <form action="/search" method="get" aria-label="搜索房源" className="relative z-10 mt-7 rounded-[22px] border border-slate-200 bg-white p-2 shadow-[0_12px_36px_rgba(15,23,42,0.07)]">
              <div className="flex items-center gap-3 rounded-2xl px-3 py-3 focus-within:bg-slate-50">
                <MapPin className="size-5 shrink-0 text-[#0668e1]" aria-hidden="true" />
                <div className="min-w-0 flex-1"><span className="mb-1 block text-[11px] font-semibold text-slate-500">想住在哪里？</span><LocationAutocomplete name="q" defaultValue="Los Angeles" ariaLabel="想住在哪里？" placeholder="城市、学校或公司" inputClassName="text-sm font-semibold text-slate-950" /></div>
              </div>
              <div className="flex flex-wrap items-center border-t border-slate-100 sm:flex-nowrap">
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><CalendarDays className="size-3.5" />入住</span><input type="date" name="moveIn" aria-label="入住日期" className="w-full min-w-0 bg-transparent text-xs font-semibold text-slate-800 outline-none sm:text-sm" /></label>
                <span className="h-9 w-px bg-slate-200" />
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><CalendarDays className="size-3.5" />退租</span><input type="date" name="moveOut" aria-label="退租日期" className="w-full min-w-0 bg-transparent text-xs font-semibold text-slate-800 outline-none sm:text-sm" /></label>
                <button type="submit" className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0668e1] px-5 py-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:mt-0 sm:w-auto"><Search className="size-4" />搜索房源</button>
              </div>
            </form>
            <p className="mt-3 text-[11px] text-slate-400">日期还没定？直接搜索，先发现喜欢的房源。</p>
          </div>
          {featured ? <Link href={`/listing/${encodeURIComponent(featured.id)}`} className="group relative hidden h-[405px] overflow-hidden rounded-[26px] bg-slate-200 lg:block">
            <Image src={featured.image} alt={featured.title} fill priority sizes="45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.025]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
            <span className="absolute left-5 top-5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-800">发现一个新家</span>
            <div className="absolute inset-x-6 bottom-6 text-white"><p className="flex items-center gap-1.5 text-xs text-white/80"><MapPin className="size-3.5" />{featured.area}</p><h2 className="mt-2 text-xl font-semibold">{featured.title}</h2><div className="mt-3 flex items-center justify-between"><p className="text-lg font-bold">${featured.price.toLocaleString()}<span className="ml-1 text-xs font-normal text-white/75">/ 月</span></p><span className="grid size-9 place-items-center rounded-full bg-white text-slate-900"><ArrowRight className="size-4" /></span></div></div>
          </Link> : null}
        </div>
        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="热门地点"><span className="mr-2 shrink-0 text-xs font-medium text-slate-500">热门城市</span>{destinations.map((destination) => <Link key={destination} href={`/search?q=${encodeURIComponent(destination)}`} className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 transition-colors hover:border-slate-500 hover:text-[#0668e1]">{destination}</Link>)}</div>
      </div>
    </section>

    <section className="mx-auto max-w-[1520px] px-4 py-9 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        { icon: Sofa, label: "拎包，开启新生活", detail: "带家具的房源", amenity: "带家具" },
        { icon: TrainFront, label: "把通勤变短一点", detail: "地铁附近的房源", amenity: "近地铁" },
        { icon: KeyRound, label: "留一点自己的空间", detail: "带独卫的房源", amenity: "独卫" },
        { icon: UsersRound, label: "和毛孩子一起住", detail: "宠物友好房源", amenity: "宠物" }
      ].map(({ icon: Icon, label, detail, amenity }) => <Link key={amenity} href={`/search?amenities=${encodeURIComponent(amenity)}`} className="group flex items-center gap-3 rounded-2xl border border-slate-200 px-3 py-4 transition-colors hover:border-blue-200 hover:bg-blue-50/50 sm:px-5"><Icon className="size-6 shrink-0 text-slate-500 group-hover:text-[#0668e1]" /><span className="min-w-0"><span className="block text-xs font-semibold text-slate-900 sm:text-sm">{label}</span><span className="mt-1 block text-[11px] text-slate-500 sm:text-xs">{detail}</span></span><ChevronRight className="ml-auto hidden size-4 text-slate-400 xl:block" /></Link>)}</div>
      <div className="mt-10 flex items-end justify-between gap-4"><div><h2 className="text-2xl font-bold tracking-tight text-slate-950">为下一段生活，找个落脚点</h2><p className="mt-2 text-sm text-slate-500">看看这些房源，从位置、月租和租期开始比较。</p></div><Link href="/search" className="hidden items-center gap-1 whitespace-nowrap text-sm font-semibold text-slate-700 hover:text-[#0668e1] sm:flex">查看全部 <ArrowRight className="size-4" /></Link></div>
      <div className="mt-6 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing, index) => <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`} className="group min-w-0"><div className="relative aspect-[1.35] overflow-hidden rounded-[20px] bg-slate-100"><Image src={listing.image} alt={listing.title} fill priority={index === 0} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.035]" />{listing.tags.includes("带家具") ? <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold">带家具</span> : null}</div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-xl font-bold tracking-tight">${listing.price.toLocaleString()}<span className="ml-1 text-xs font-normal text-slate-500">/ 月</span></p><span className="flex items-center gap-1 text-xs"><Star className="size-3 fill-slate-900" />{listing.score}</span></div><h3 className="mt-1.5 truncate text-sm font-semibold group-hover:text-[#0668e1]">{listing.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{listing.area}</p><p className="mt-2 text-xs text-slate-500">{listing.beds} 卧 · {listing.baths} 卫 · {listing.tags.slice(0, 2).join(" · ")}</p></Link>)}</div>
      {!listings.length ? <p className="mt-6 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">新房源正在准备中，可以先选择感兴趣的城市。</p> : null}
      <Link href="/search" className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold sm:hidden">查看全部房源 <ArrowRight className="size-4" /></Link>
    </section>
    <section className="mx-auto max-w-[1520px] px-4 pb-14 pt-5 sm:px-6 lg:px-8"><div className="grid gap-6 rounded-[24px] bg-[#f3f6fa] p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12"><div><p className="text-xs font-semibold text-[#0668e1]">安心开始，不用着急决定</p><h2 className="mt-3 text-2xl font-bold tracking-tight">先喜欢，再了解，最后安顿。</h2><Link href="/roommates" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#0668e1]">也在找合拍的室友？ <ArrowRight className="size-4" /></Link></div><ol className="grid gap-5 sm:grid-cols-3">{[["01", "发现与比较", "按位置、月租与租期缩小范围。"], ["02", "沟通与看房", "联系房东，把在意的细节问清楚。"], ["03", "提交申请", "房东接受申请后，再进入付款。"]].map(([number, title, detail]) => <li key={number}><span className="text-xs font-semibold text-slate-400">{number}</span><h3 className="mt-2 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{detail}</p></li>)}</ol></div></section>
  </main>;
}
