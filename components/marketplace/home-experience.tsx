import { ArrowRight, CalendarDays, ChevronRight, KeyRound, MapPin, Search, Sofa, TrainFront, UsersRound } from "lucide-react";
import Image from "@/components/ui/app-image";
import Link from "next/link";

import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import type { PreviewListing } from "@/lib/preview-data";

const destinations = ["Los Angeles", "New York", "Boston", "San Francisco Bay Area", "Seattle", "Chicago", "Austin", "Washington, DC"];

export function HomeExperience({ listings }: { listings: PreviewListing[] }) {
  const featured = listings[0];
  return (
    <main className="bg-white text-[#203C30]">
      <section className="border-b border-[#234B3B]/15 bg-[#F5F8F5]">
        <div className="mx-auto max-w-[1440px] px-4 pb-7 pt-8 sm:px-6 sm:pt-10 lg:px-10 lg:pb-8 lg:pt-12">
          <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:gap-12 xl:gap-20">
            <div className="min-w-0 py-1 lg:py-5">
              <h1 className="text-[42px] font-semibold leading-[1.18] tracking-[-0.035em] sm:text-[56px] xl:text-[76px]">
                留学生转租，<br />接上下一站。
              </h1>
              <p className="mt-6 max-w-lg text-sm leading-7 text-[#416F5A] sm:text-base">回国过暑假、异地实习、毕业搬家，住处和租期都要接得上。</p>
              <p className="mt-1 max-w-lg text-sm leading-7 text-[#416F5A]">按学校周边、月租和可租日期，找到适合自己的转租。</p>

              <form action="/search" method="get" aria-label="搜索房源" className="relative z-10 mt-7 rounded-[24px] border border-[#234B3B]/20 bg-white p-2 shadow-[0_12px_36px_rgba(35,75,59,0.05)]">
                <div className="flex items-center gap-3 rounded-[18px] px-3 py-3 focus-within:bg-[#F5F8F5]">
                  <MapPin className="size-5 shrink-0 text-[#416F5A]" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className="mb-1 block text-xs font-medium text-[#416F5A]">想住在哪里？</span>
                    <LocationAutocomplete name="q" defaultValue="Los Angeles" ariaLabel="想住在哪里？" placeholder="学校、城市或街区" inputClassName="min-h-11 text-base font-medium text-[#203C30]" />
                  </div>
                </div>
                <div className="flex flex-wrap items-center border-t border-[#234B3B]/10 sm:flex-nowrap">
                  <label className="min-w-0 flex-1 px-3 py-2">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#416F5A]"><CalendarDays className="size-3.5" aria-hidden="true" />入住</span>
                    <input type="date" name="moveIn" aria-label="入住日期" className="min-h-11 w-full min-w-0 bg-transparent text-base font-medium text-[#203C30] outline-none sm:text-sm" />
                  </label>
                  <span className="h-9 w-px bg-[#234B3B]/15" aria-hidden="true" />
                  <label className="min-w-0 flex-1 px-3 py-2">
                    <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[#416F5A]"><CalendarDays className="size-3.5" aria-hidden="true" />退租</span>
                    <input type="date" name="moveOut" aria-label="退租日期" className="min-h-11 w-full min-w-0 bg-transparent text-base font-medium text-[#203C30] outline-none sm:text-sm" />
                  </label>
                  <button type="submit" className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-[18px] bg-[#234B3B] px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#416F5A] sm:mt-0 sm:w-auto">
                    <Search className="size-4" aria-hidden="true" />搜索转租
                  </button>
                </div>
              </form>
              <p className="mt-3 text-xs leading-6 text-[#416F5A]">租期还没定？先看转租房源，再确认能否衔接你的安排。</p>
            </div>

            {featured ? (
              <Link href={`/listing/${encodeURIComponent(featured.id)}`} className="group hidden overflow-hidden rounded-[28px] rounded-tl-[140px] bg-white lg:block">
                <div className="relative h-[390px] bg-[#234B3B]/10 xl:h-[440px]">
                  <Image src={featured.image} alt={featured.title} fill priority sizes="(min-width: 1440px) 580px, 43vw" className="object-cover" />
                  <span className="absolute bottom-5 left-6 rounded-full bg-white px-4 py-2 text-xs font-medium text-[#234B3B]">了解转租房源</span>
                </div>
                <div className="flex items-center justify-between gap-4 px-6 py-6 xl:px-7">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-[#416F5A]"><MapPin className="size-3.5 shrink-0" aria-hidden="true" /><span className="truncate">{featured.area}</span></p>
                    <h2 className="mt-2 truncate text-lg font-semibold group-hover:text-[#416F5A]">{featured.title}</h2>
                    <p className="mt-2 text-lg font-semibold">${featured.price.toLocaleString()}<span className="ml-1 text-xs font-normal text-[#416F5A]">/ 月</span></p>
                    <p className="mt-2 text-xs leading-6 text-[#416F5A]">{featured.availableFrom && featured.availableTo ? `可租日期 ${featured.availableFrom} – ${featured.availableTo}` : "租期待确认"}</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#E9F2A9] text-[#234B3B]"><ArrowRight className="size-5" aria-hidden="true" /></span>
                </div>
              </Link>
            ) : null}
          </div>

          <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] lg:mt-8" aria-label="热门地点">
            <span className="mr-2 shrink-0 text-xs font-medium text-[#416F5A]">热门城市</span>
            {destinations.map((destination) => (
              <Link key={destination} href={`/search?q=${encodeURIComponent(destination)}`} className="flex min-h-11 shrink-0 items-center rounded-full border border-[#234B3B]/15 bg-white px-4 py-2 text-xs font-medium text-[#234B3B] transition-colors hover:border-[#416F5A] hover:bg-[#E9F2A9]">
                {destination}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 py-7 sm:px-6 lg:px-10 lg:py-9">
        <div className="grid grid-cols-2 gap-x-5 lg:grid-cols-4 lg:gap-x-8">
          {[
            { icon: Sofa, label: "换住处，少搬家具", detail: "带家具的房源", amenity: "带家具" },
            { icon: TrainFront, label: "上课实习好通勤", detail: "地铁附近的房源", amenity: "近地铁" },
            { icon: KeyRound, label: "合租也有自己的空间", detail: "带独卫的房源", amenity: "独卫" },
            { icon: UsersRound, label: "和毛孩子一起住", detail: "宠物友好房源", amenity: "宠物" }
          ].map(({ icon: Icon, label, detail, amenity }) => (
            <Link key={amenity} href={`/search?amenities=${encodeURIComponent(amenity)}`} className="group flex min-h-[88px] items-center gap-3 border-b border-[#234B3B]/15 py-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F5F8F5] text-[#416F5A] transition-colors group-hover:bg-[#E9F2A9]"><Icon className="size-5" aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block text-xs font-semibold sm:text-sm">{label}</span><span className="mt-1 block text-[11px] leading-5 text-[#416F5A] sm:text-xs">{detail}</span></span>
              <ChevronRight className="ml-auto hidden size-4 shrink-0 text-[#416F5A] xl:block" aria-hidden="true" />
            </Link>
          ))}
        </div>

        <div className="mt-10 flex items-end justify-between gap-4 lg:mt-12">
          <div><h2 className="text-2xl font-semibold leading-snug tracking-tight sm:text-[28px]">适合留学安排的转租房源</h2><p className="mt-2 max-w-xl text-sm leading-7 text-[#416F5A]">先比月租、可租日期和通勤，再沟通转租安排。</p></div>
          <Link href="/search" className="hidden min-h-11 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold text-[#234B3B] hover:bg-[#F5F8F5] sm:flex">查看全部</Link>
        </div>

        <div className="mt-6 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {listings.map((listing, index) => (
            <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`} className="group min-w-0">
              <div className="relative aspect-[1.35] overflow-hidden rounded-[20px] bg-[#F5F8F5]">
                <Image src={listing.image} alt={listing.title} fill priority={index === 0} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" className="object-cover" />
                {listing.tags.includes("带家具") ? <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-[#234B3B]">带家具</span> : null}
              </div>
              <p className="mt-4 text-xl font-semibold tracking-tight">${listing.price.toLocaleString()}<span className="ml-1 text-xs font-normal text-[#416F5A]">/ 月</span></p>
              <h3 className="mt-1.5 truncate text-sm font-semibold group-hover:text-[#416F5A]">{listing.title}</h3>
              <p className="mt-1 truncate text-xs text-[#416F5A]">{listing.area}</p>
              <p className="mt-2 text-xs leading-6 text-[#416F5A]">{listing.availableFrom && listing.availableTo ? `可租 ${listing.availableFrom} – ${listing.availableTo}` : "租期待确认"}</p>
              <p className="mt-2 text-xs leading-6 text-[#416F5A]">{listing.beds} 卧 · {listing.baths} 卫 · {listing.tags.slice(0, 2).join(" · ")}</p>
            </Link>
          ))}
        </div>
        {!listings.length ? <p className="mt-6 rounded-2xl bg-[#F5F8F5] p-8 text-center text-sm leading-7 text-[#416F5A]">新房源正在准备中，可以先选择感兴趣的城市。</p> : null}
        <Link href="/search" className="mt-8 flex min-h-12 items-center justify-center rounded-full border border-[#234B3B]/25 px-5 py-3 text-sm font-semibold text-[#234B3B] hover:bg-[#F5F8F5] sm:hidden">查看全部房源</Link>
      </section>

      <section className="mx-auto max-w-[1440px] px-4 pb-14 pt-5 sm:px-6 lg:px-10">
        <div className="grid gap-7 rounded-[28px] bg-[#F5F8F5] p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-12 lg:p-10">
          <div>
            <h2 className="text-2xl font-semibold leading-snug tracking-tight">先核对租期，再沟通转租。</h2>
            <p className="mt-3 text-sm leading-7 text-[#416F5A]">接租前，和发布者确认原租约、转租许可、费用与交接安排。</p>
            <Link href="/roommates" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full text-sm font-semibold text-[#234B3B] hover:text-[#416F5A]"><UsersRound className="size-4" aria-hidden="true" />也在找合拍的室友？</Link>
          </div>
          <ol className="grid gap-6 sm:grid-cols-3">
            {[["01", "找合适的转租", "按学校通勤、月租与可租日期比较。"], ["02", "沟通与看房", "联系发布者，确认转租条件和房屋情况。"], ["03", "确认后再申请", "核对租约、费用与交接细节后，再提交申请。"]].map(([number, title, detail]) => (
              <li key={number} className="border-t border-[#234B3B]/20 pt-4"><span className="text-xs font-medium text-[#416F5A]">{number}</span><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-6 text-[#416F5A]">{detail}</p></li>
            ))}
          </ol>
        </div>
      </section>
    </main>
  );
}
