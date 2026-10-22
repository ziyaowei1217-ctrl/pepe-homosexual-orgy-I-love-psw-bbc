"use client";

import {
  ArrowLeft,
  Bath,
  BedDouble,
  CalendarDays,
  Check,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  TrainFront,
  UserRound,
  Wallet
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { ListingLocationMap } from "@/components/marketplace/listing-map";
import { ListingPhotoGallery } from "@/components/marketplace/listing-photo-gallery";
import { ListingStayDialog, ListingStayFields } from "@/components/marketplace/listing-stay-selector";
import { formatDateLong, formatRangeLong } from "@/lib/date-format";
import { getListingPoint } from "@/lib/listing-map";
import { applicationHref, earliestListingDate, initialListingStay, listingHref, listingStayError, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { safeSearchReturn } from "@/lib/search-state";
import { formatStayLength, formatUsd, stayPrice } from "@/lib/stay-price";
import { cn } from "@/lib/utils";

const sections = [["listing-overview", "房源概况"], ["listing-highlights", "租期与亮点"], ["listing-amenities", "设施"], ["listing-location", "位置与通勤"]] as const;

export function ListingDetailExperience({ listing, initialStay }: { listing: PreviewListing; initialStay?: Partial<ListingStay> }) {
  const { savedIds, toggleSaved } = useSavedListings();
  const saved = savedIds.has(listing.id);
  const [stay, setStay] = useState(() => {
    if (typeof window !== "undefined" && window.location.pathname === `/listing/${encodeURIComponent(listing.id)}`) {
      const params = new URLSearchParams(window.location.search);
      return initialListingStay(listing, { moveIn: params.get("moveIn") ?? "", moveOut: params.get("moveOut") ?? "" });
    }
    return initialListingStay(listing, initialStay);
  });
  const [stayOpen, setStayOpen] = useState(false);
  const [selectionId, setSelectionId] = useState("");
  const activeSection = useActiveSection(sections.map(([id]) => id));
  const stayError = listingStayError(stay, listing);
  const hasDates = Boolean(stay.moveIn && stay.moveOut);
  // psw: with valid dates the headline is the rent for exactly those dates (whole months + extra days by the month's length).
  const price = stayError ? null : stayPrice(listing.price, stay.moveIn, stay.moveOut);
  const stayDates = stayError ? (hasDates ? "这段日期不可租，改日期" : "选择可租日期") : formatRangeLong(stay.moveIn, stay.moveOut);
  const applyHref = applicationHref(listing.id, stay, selectionId);
  const inboxHref = `/inbox?listingId=${encodeURIComponent(listing.id)}`;
  const earliestMoveIn = earliestListingDate(listing);
  const bookable = Boolean(listing.availableFrom && listing.availableTo > earliestMoveIn);
  // One availability range everywhere on the page: from today or the listing's start, whichever is later.
  const availabilityLabel = bookable ? `${formatDateLong(earliestMoveIn)}起可入住` : "租期待确认";
  const availableRange = bookable ? formatRangeLong(earliestMoveIn, listing.availableTo) : "请联系房东确认";
  const amenities = listing.tags.filter((tag) => !tag.includes("入住") && tag !== "房东知情");
  const hostVerified = listing.trust.includes("平台已审核");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [returnHref, setReturnHref] = useState("/search");

  useEffect(() => {
    try { setReturnHref(safeSearchReturn(sessionStorage.getItem("sublet:last-search"))); } catch { /* The search route remains available without storage. */ }
  }, []);

  useEffect(() => {
    setSelectionId(newSelectionId());
    function restoreStay() {
      if (window.location.pathname !== `/listing/${encodeURIComponent(listing.id)}`) return;
      const params = new URLSearchParams(window.location.search);
      setStay(initialListingStay(listing, { moveIn: params.get("moveIn") ?? "", moveOut: params.get("moveOut") ?? "" }));
      setSelectionId(newSelectionId());
    }
    window.addEventListener("popstate", restoreStay);
    return () => window.removeEventListener("popstate", restoreStay);
  }, [listing]);

  function updateStay(value: ListingStay) {
    setStay(value);
    setSelectionId(newSelectionId());
    window.history.replaceState(null, "", listingHref(listing.id, value));
  }

  async function shareListing() {
    const url = globalThis.location?.href ?? "";
    try {
      if (typeof globalThis.navigator?.share === "function") {
        await globalThis.navigator.share({ title: listing.title, url });
        return;
      }
      if (globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(url);
        setShareStatus("链接已复制");
        return;
      }
      setShareStatus("请复制浏览器地址分享");
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setShareStatus("暂时无法分享");
    }
  }

  const highlights = [
    [TrainFront, "通勤", listing.commute],
    [CalendarDays, "可住日期", availableRange],
    [Sparkles, "入住条件", amenities.length ? amenities.join(" · ") : "房东暂未补充"],
    [Wallet, "什么时候付钱", "提交申请不付款，房东接受后再付"]
  ] as const;

  return (
    <main className="bg-background pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="page-container pt-3 sm:pt-5">
        <div className="flex items-center justify-between gap-4 py-2">
          <Link href={returnHref} className="-ml-3 flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold text-ink-secondary hover:bg-surface-subtle sm:text-sm"><ArrowLeft className="size-4" aria-hidden="true" />返回搜索</Link>
          <div className="-mr-3 flex items-center gap-1">
            <button type="button" onClick={() => void shareListing()} className="flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold text-ink-secondary hover:bg-surface-subtle sm:text-sm"><Share2 className="size-4" aria-hidden="true" />{shareStatus ?? "分享"}</button>
            <button type="button" onClick={() => toggleSaved(listing.id)} className={cn("flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold hover:bg-surface-subtle sm:text-sm", saved ? "text-primary-text" : "text-ink-secondary")} aria-label={saved ? "取消收藏房源" : "收藏房源"}>
              <Heart className={cn("size-4", saved && "fill-current")} aria-hidden="true" />{saved ? "已收藏" : "收藏"}
            </button>
          </div>
        </div>

        <ListingPhotoGallery listing={listing} />

        <nav aria-label="房源详情章节" className="sticky top-[72px] z-30 -mx-4 mt-4 flex gap-2 overflow-x-auto border-b border-line-strong bg-background px-2 [scrollbar-width:none] sm:-mx-8 sm:px-6">
          {sections.map(([id, label]) => <a key={id} href={`#${id}`} aria-current={activeSection === id ? "location" : undefined} className={cn("flex min-h-12 shrink-0 items-center border-b-2 px-2 text-[15px] font-semibold sm:text-sm", activeSection === id ? "border-primary text-primary-text" : "border-transparent text-ink-secondary hover:text-ink")}>{label}</a>)}
        </nav>

        <div className="grid gap-10 pb-20 pt-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-16">
          <div className="min-w-0">
            <section id="listing-overview" className="scroll-mt-40 border-b border-line-strong pb-8">
              <div className="flex flex-wrap items-center gap-2 text-m-footnote font-bold">
                {listing.trust ? <span className="flex items-center gap-1 rounded-psw-sm bg-tag-neutral px-2.5 py-1 text-ink-secondary"><ShieldCheck className="size-3.5" aria-hidden="true" />{listing.trust}</span> : null}
                <span className="rounded-psw-sm bg-primary-soft px-2.5 py-1 text-primary-text">{availabilityLabel}</span>
              </div>
              <h1 className="mt-4 text-m-title text-ink md:text-d-large-title">{listing.title}</h1>
              <p className="mt-3 flex items-center gap-2 text-m-subhead font-semibold text-ink-secondary sm:text-d-subhead"><MapPin className="size-4 text-primary-text" aria-hidden="true" />{listing.area}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-m-subhead font-semibold text-ink-secondary sm:text-d-subhead">
                <span className="flex items-center gap-1.5"><BedDouble className="size-4" aria-hidden="true" />{listing.beds} 间卧室</span>
                <span className="flex items-center gap-1.5"><Bath className="size-4" aria-hidden="true" />{listing.baths} 间卫浴</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 lg:hidden">
                <Link href={`${inboxHref}&tour=1`} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-soft px-3 font-rounded text-[15px] font-bold text-primary-text"><CalendarDays className="size-4" aria-hidden="true" />预约看房</Link>
                <Link href={inboxHref} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-primary-soft px-3 font-rounded text-[15px] font-bold text-primary-text"><MessageCircle className="size-4" aria-hidden="true" />联系房东</Link>
              </div>
            </section>

            <section aria-labelledby="listing-host" className="border-b border-line-strong py-7">
              <div className="flex items-center gap-4">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text"><UserRound className="size-6" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1"><h2 id="listing-host" className="text-m-headline sm:text-d-headline">平台房东发布</h2><p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">{hostVerified ? "平台已审核房东授权，可在站内消息里确认身份和看房安排" : "房东授权还在审核，可以先在站内消息里确认身份和看房安排"}</p></div>
                {hostVerified ? <ShieldCheck className="size-6 shrink-0 text-success-text" role="img" aria-label="平台已审核房东授权" /> : null}
              </div>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 id="listing-highlights" className="scroll-mt-40 text-[22px] font-bold leading-[30px] sm:text-d-title">租期与亮点</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {highlights.map(([Icon, title, detail]) => <div key={title} className="flex gap-3 rounded-psw-lg bg-surface p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text"><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0"><h3 className="text-d-label text-ink">{title}</h3><p className="mt-0.5 text-m-subhead text-ink-secondary sm:text-d-subhead">{detail}</p></div></div>)}
              </div>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 className="text-[22px] font-bold leading-[30px] sm:text-d-title">关于这个家</h2>
              <p className="mt-4 max-w-[640px] text-m-body text-ink-secondary sm:text-d-body">房源的租期、价格、设施、交通与信任状态已汇总在本页。申请前建议通过站内消息确认细节，并按需预约看房。</p>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 id="listing-amenities" className="scroll-mt-40 text-[22px] font-bold leading-[30px] sm:text-d-title">房源设施</h2>
              {amenities.length ? <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                {amenities.map((item) => <li key={item} className="flex items-center gap-3 text-m-subhead font-semibold text-ink sm:text-d-subhead"><Check className="size-5 text-primary-text" aria-hidden="true" />{item}</li>)}
              </ul> : <p className="mt-4 text-d-subhead text-ink-secondary">房东暂未补充设施信息，可在站内消息中确认。</p>}
            </section>

            <section className="py-8">
              <h2 id="listing-location" className="scroll-mt-40 text-[22px] font-bold leading-[30px] sm:text-d-title">位置与通勤</h2>
              <ListingLocationMap point={getListingPoint(listing)} area={listing.area} />
            </section>
          </div>

          <aside className="hidden lg:block" aria-label="预订">
            <div className="sticky top-[148px] rounded-psw-xl bg-surface p-6 shadow-menu">
              <p><span className="font-display text-[28px] font-extrabold leading-none text-primary-text">{formatUsd(listing.price)}</span><span className="text-d-subhead text-ink-secondary"> / 月</span></p>
              <h2 className="mt-5 text-d-label">你的日期</h2>
              <div className="mt-2"><ListingStayFields listing={listing} stay={stay} onChange={updateStay} /></div>
              {stayError ? <p role="alert" className="mt-3 text-d-subhead text-danger-text">{stayError}</p> : <p className="mt-3 flex items-center gap-1.5 text-m-footnote font-semibold text-success-text"><Check className="size-3.5" aria-hidden="true" />所选租期可申请</p>}
              <div className="mt-5 border-t border-line-strong pt-5">
                <h2 className="text-d-label">费用明细</h2>
                <dl className="mt-3 space-y-3 text-d-subhead">
                  {price ? <>
                    {price.wholeMonths ? <div className="flex justify-between gap-3 text-ink-secondary"><dt>房租 {formatUsd(listing.price)} × {price.wholeMonths} 个月</dt><dd className="font-display font-bold text-ink">{formatUsd(listing.price * price.wholeMonths)}</dd></div> : null}
                    {price.extraDays ? <div className="flex justify-between gap-3 text-ink-secondary"><dt>另外 {price.extraDays} 天（按当月 {price.extraPeriodDays} 天折算）</dt><dd className="font-display font-bold text-ink">{formatUsd(price.extraAmount)}</dd></div> : null}
                  </> : <div className="flex justify-between gap-3 text-ink-secondary"><dt>月租</dt><dd className="font-display font-bold text-ink">{formatUsd(listing.price)}</dd></div>}
                  <div className="flex justify-between gap-3 text-ink-secondary"><dt>平台服务</dt><dd>申请接受后确认</dd></div>
                  <div className="flex justify-between gap-3 border-t border-line-strong pt-3 font-bold"><dt>申请时支付</dt><dd className="font-display">$0</dd></div>
                </dl>
              </div>
              {/* psw 决定块: 夜墨底、青柠总价、青柠「申请租住」, the same block as the phone's bottom bar. */}
              <div className="mt-5 rounded-psw-lg bg-ink-block p-5 text-on-dark">
                <p className="text-d-subhead text-on-dark-secondary">{price ? `房租总价 · ${formatStayLength(price)}` : hasDates ? "这段日期不可租，换一段日期后显示总价" : "选好日期后显示总价"}</p>
                <p className="font-display text-[32px] font-extrabold leading-10 text-accent">{price ? formatUsd(price.total) : `${formatUsd(listing.price)}/月`}</p>
                {price ? <p className="text-d-subhead text-on-dark-secondary">月租 {formatUsd(listing.price)} · 零头按当月天数折算</p> : null}
                {stayError ? <button type="button" disabled className="mt-4 min-h-12 w-full rounded-full bg-on-dark/10 px-5 font-rounded text-base font-bold text-on-dark-secondary">先选可租的日期</button> : <Link href={applyHref} className="mt-4 flex min-h-12 w-full items-center justify-center rounded-full bg-accent px-5 font-rounded text-base font-bold text-on-accent transition-colors hover:bg-accent-hover active:scale-[0.97]">申请租住</Link>}
              </div>
              <p className="mt-3 text-center text-m-footnote text-ink-secondary">提交申请不会立即扣款</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`${inboxHref}&tour=1`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary-soft px-3 font-rounded text-sm font-bold text-primary-text hover:bg-primary-soft-hover"><CalendarDays className="size-4" aria-hidden="true" />预约看房</Link>
                <Link href={inboxHref} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary-soft px-3 font-rounded text-sm font-bold text-primary-text hover:bg-primary-soft-hover"><MessageCircle className="size-4" aria-hidden="true" />联系房东</Link>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* psw 决定块 on phones: 夜墨 bar, 青柠 total and 青柠「申请租住」. Only the dates are tappable. */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-ink-block px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-on-dark shadow-[0_-8px_30px_rgba(29,22,64,0.18)] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5"><span className="text-m-footnote text-on-dark-secondary">{price ? "总价" : "月租"}</span><span className="font-display text-[22px] font-extrabold leading-7 text-accent">{formatUsd(price ? price.total : listing.price)}</span>{price ? null : <span className="text-m-footnote text-on-dark-secondary">/ 月</span>}</p>
            <p className="flex min-w-0 items-center gap-1 text-m-footnote text-on-dark-secondary"><button type="button" onClick={() => setStayOpen(true)} className="tap-target min-w-0 shrink truncate font-semibold text-on-dark underline underline-offset-4">{stayDates}</button>{price ? <span className="shrink-0">· {formatStayLength(price)}</span> : null}</p>
          </div>
          {stayError ? <button type="button" onClick={() => setStayOpen(true)} className="flex min-h-12 shrink-0 basis-[44%] items-center justify-center rounded-full bg-accent px-5 font-rounded text-base font-bold text-on-accent active:scale-[0.97]">选择租期</button> : <Link href={applyHref} className="flex min-h-12 shrink-0 basis-[44%] items-center justify-center rounded-full bg-accent px-5 font-rounded text-base font-bold text-on-accent hover:bg-accent-hover active:scale-[0.97]">申请租住</Link>}
        </div>
      </div>

      {stayOpen ? <ListingStayDialog listing={listing} stay={stay} onClose={() => setStayOpen(false)} onApply={(value) => { updateStay(value); setStayOpen(false); }} /> : null}
    </main>
  );
}

/** The section the reader is in, for the sticky section tabs. */
function useActiveSection(ids: readonly string[]) {
  const [active, setActive] = useState<string>(ids[0]);
  const key = ids.join(",");
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      const first = key.split(",").find((id) => visible.get(id));
      if (first) setActive(first);
    }, { rootMargin: "-140px 0px -55% 0px" });
    for (const id of key.split(",")) {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [key]);
  return active;
}

function newSelectionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
