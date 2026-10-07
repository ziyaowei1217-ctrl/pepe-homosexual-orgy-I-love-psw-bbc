import { ArrowRight, CalendarDays, Check, ChevronRight, KeyRound, MapPin, Search, Sofa, Star, TrainFront, UsersRound } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";

import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import type { PreviewListing } from "@/lib/preview-data";

const destinations = ["Los Angeles", "New York", "Boston", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC"];

export function HomeExperience({ listings }: { listings: PreviewListing[] }) {
  const featured = listings[0];
  return <main className="bg-[#f6f7fb]">
    <section className="relative isolate overflow-hidden bg-[#070b1a] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-48 size-[620px] rounded-full bg-[#2453ff]/45 blur-[140px]" />
        <div className="absolute -right-32 top-24 size-[520px] rounded-full bg-[#7c3aed]/35 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
      </div>
      <div className="mx-auto max-w-[1520px] px-4 pb-10 pt-10 sm:px-6 lg:px-8 lg:pb-14 lg:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="py-1">
            <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-100 backdrop-blur"><span className="size-1.5 rounded-full bg-[#5b8cff] shadow-[0_0_12px_#5b8cff]" />A place for your next chapter</p>
            <h1 className="mt-6 text-[46px] font-black leading-[1.08] tracking-[-0.03em] sm:text-[64px] xl:text-[76px]">下一站，<br /><span className="bg-gradient-to-r from-[#7aa2ff] via-[#a78bfa] to-[#f0abfc] bg-clip-text text-transparent">住得自在。</span></h1>
            <p className="mt-6 max-w-lg text-base font-semibold leading-7 text-slate-200 sm:text-lg">更轻松地找到全美主要城市的下一处住所</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">从一间合适的房，到一段新的生活。先选城市，再慢慢挑。</p>
            <form action="/search" method="get" aria-label="搜索房源" className="relative z-10 mt-8 rounded-[26px] bg-white p-2 text-slate-950 shadow-[0_30px_80px_rgba(4,8,30,0.55)] ring-1 ring-white/20">
              <div className="flex items-center gap-3 rounded-2xl px-3 py-3 focus-within:bg-slate-50">
                <MapPin className="size-5 shrink-0 text-[#2453ff]" aria-hidden="true" />
                <div className="min-w-0 flex-1"><span className="mb-1 block text-[11px] font-bold text-slate-500">想住在哪里？</span><LocationAutocomplete name="q" defaultValue="Los Angeles" ariaLabel="想住在哪里？" placeholder="城市、学校或公司" inputClassName="text-sm font-bold text-slate-950" /></div>
              </div>
              <div className="flex flex-wrap items-center border-t border-slate-100 sm:flex-nowrap">
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><CalendarDays className="size-3.5" />入住</span><input type="date" name="moveIn" aria-label="入住日期" className="w-full min-w-0 bg-transparent text-xs font-semibold text-slate-800 outline-none sm:text-sm" /></label>
                <span className="h-9 w-px bg-slate-200" />
                <label className="min-w-0 flex-1 px-3 py-3"><span className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><CalendarDays className="size-3.5" />退租</span><input type="date" name="moveOut" aria-label="退租日期" className="w-full min-w-0 bg-transparent text-xs font-semibold text-slate-800 outline-none sm:text-sm" /></label>
                <button type="submit" className="mt-1 flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-[#2453ff] to-[#6d4aff] px-6 py-4 text-sm font-black text-white shadow-[0_12px_30px_rgba(36,83,255,0.45)] transition hover:brightness-110 sm:mt-0 sm:w-auto"><Search className="size-4" />搜索房源</button>
              </div>
            </form>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-slate-300">{["按月租住，租期灵活", "地图上比较通勤", "房东接受后再付款"].map((item) => <li key={item} className="flex items-center gap-2"><Check className="size-3.5 text-[#7aa2ff]" aria-hidden="true" />{item}</li>)}</ul>
          </div>
          {featured ? <Link href={`/listing/${encodeURIComponent(featured.id)}`} className="group relative hidden h-[480px] overflow-hidden rounded-[32px] bg-slate-800 shadow-[0_40px_100px_rgba(0,0,0,0.5)] ring-1 ring-white/15 lg:block">
            <SmartImage src={featured.image} alt={featured.title} fill priority sizes="45vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#070b1a] via-[#070b1a]/20 to-transparent" />
            <span className="absolute left-5 top-5 rounded-full bg-white px-3.5 py-1.5 text-xs font-black text-slate-900 shadow-lg">发现一个新家</span>
            <div className="absolute inset-x-6 bottom-6 text-white"><p className="flex items-center gap-1.5 text-xs font-semibold text-white/75"><MapPin className="size-3.5" />{featured.area}</p><h2 className="mt-2 text-2xl font-black tracking-tight">{featured.title}</h2><div className="mt-4 flex items-center justify-between"><p className="text-2xl font-black">${featured.price.toLocaleString("en-US")}<span className="ml-1 text-xs font-semibold text-white/70">/ 月</span></p><span className="grid size-11 place-items-center rounded-full bg-white text-slate-900 transition-transform group-hover:translate-x-0.5"><ArrowRight className="size-4" /></span></div></div>
          </Link> : null}
        </div>
        <div className="mt-10 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="热门地点"><span className="mr-2 shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">热门城市</span>{destinations.map((destination) => <Link key={destination} href={`/search?q=${encodeURIComponent(destination)}`} className="shrink-0 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:border-white/40 hover:bg-white/15">{destination}</Link>)}</div>
      </div>
    </section>

    <section className="mx-auto max-w-[1520px] px-4 py-9 sm:px-6 lg:px-8">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        { icon: Sofa, label: "拎包，开启新生活", detail: "带家具的房源", amenity: "带家具" },
        { icon: TrainFront, label: "把通勤变短一点", detail: "地铁附近的房源", amenity: "近地铁" },
        { icon: KeyRound, label: "留一点自己的空间", detail: "带独卫的房源", amenity: "独卫" },
        { icon: UsersRound, label: "和毛孩子一起住", detail: "宠物友好房源", amenity: "宠物" }
      ].map(({ icon: Icon, label, detail, amenity }) => <Link key={amenity} href={`/search?amenities=${encodeURIComponent(amenity)}`} className="group flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-4 transition-[color,background-color,border-color,box-shadow] hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-[0_10px_28px_rgba(36,83,255,0.08)] sm:px-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-50 text-slate-500 transition-colors group-hover:bg-white group-hover:text-[#2453ff]"><Icon className="size-5" aria-hidden="true" /></span><span className="min-w-0"><span className="block text-xs font-semibold text-slate-900 sm:text-sm">{label}</span><span className="mt-1 block text-[11px] text-slate-500 sm:text-xs">{detail}</span></span><ChevronRight className="ml-auto hidden size-4 text-slate-400 xl:block" /></Link>)}</div>
      <div className="mt-10 flex items-end justify-between gap-4"><div><h2 className="text-3xl font-black tracking-[-0.02em] text-slate-950 sm:text-4xl">为下一段生活，找个落脚点</h2><p className="mt-2 text-sm text-slate-500">看看这些房源，从位置、月租和租期开始比较。</p></div><Link href="/search" className="hidden items-center gap-1 whitespace-nowrap text-sm font-semibold text-slate-700 hover:text-[#2453ff] sm:flex">查看全部 <ArrowRight className="size-4" /></Link></div>
      <div className="mt-6 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{listings.map((listing, index) => <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`} className="group min-w-0"><div className="relative aspect-[1.35] overflow-hidden rounded-[20px] bg-slate-100 ring-1 ring-slate-900/5 transition-[box-shadow,transform] duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_40px_rgba(15,23,42,0.14)]"><SmartImage src={listing.image} alt={listing.title} fill priority={index === 0} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover transition-transform duration-500 group-hover:scale-[1.035]" />{listing.tags.includes("带家具") ? <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold">带家具</span> : null}</div><div className="mt-3 flex items-center justify-between gap-2"><p className="text-xl font-black tracking-tight">${listing.price.toLocaleString("en-US")}<span className="ml-1 text-xs font-normal text-slate-500">/ 月</span></p><span className="flex items-center gap-1 text-xs"><Star className="size-3 fill-slate-900" />{listing.score}</span></div><h3 className="mt-1.5 truncate text-sm font-semibold group-hover:text-[#2453ff]">{listing.title}</h3><p className="mt-1 truncate text-xs text-slate-500">{listing.area}</p><p className="mt-2 text-xs text-slate-500">{listing.beds} 卧 · {listing.baths} 卫 · {listing.tags.slice(0, 2).join(" · ")}</p></Link>)}</div>
      {!listings.length ? <p className="mt-6 rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">新房源正在准备中，可以先选择感兴趣的城市。</p> : null}
      <Link href="/search" className="mt-8 flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold sm:hidden">查看全部房源 <ArrowRight className="size-4" /></Link>
    </section>
    <section className="mx-auto max-w-[1520px] px-4 pb-14 pt-5 sm:px-6 lg:px-8"><div className="relative isolate grid gap-8 overflow-hidden rounded-[32px] bg-[#070b1a] p-7 text-white sm:p-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-12"><div aria-hidden="true" className="absolute -right-24 -top-24 -z-10 size-[420px] rounded-full bg-[#6d4aff]/40 blur-[120px]" /><div><p className="text-xs font-black uppercase tracking-[0.16em] text-[#7aa2ff]">安心开始，不用着急决定</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">先喜欢，再了解，最后安顿。</h2><Link href="/roommates" className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-blue-50">也在找合拍的室友？ <ArrowRight className="size-4" /></Link></div><ol className="grid gap-4 sm:grid-cols-3">{[["01", "发现与比较", "按位置、月租与租期缩小范围。"], ["02", "沟通与看房", "联系房东，把在意的细节问清楚。"], ["03", "提交申请", "房东接受申请后，再进入付款。"]].map(([number, title, detail]) => <li key={number} className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur"><span className="bg-gradient-to-r from-[#7aa2ff] to-[#c4b5fd] bg-clip-text text-3xl font-black text-transparent">{number}</span><h3 className="mt-3 text-base font-black">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-400">{detail}</p></li>)}</ol></div></section>
  </main>;
}
