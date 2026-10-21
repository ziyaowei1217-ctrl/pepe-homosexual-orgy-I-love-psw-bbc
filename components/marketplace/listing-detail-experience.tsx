"use client";

import {
  ArrowLeft,
  BadgeCheck,
  Bath,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  Heart,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  TrainFront
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { ListingPhotoGallery } from "@/components/marketplace/listing-photo-gallery";
import { ListingStayDialog, ListingStayFields } from "@/components/marketplace/listing-stay-selector";
import { defaultMapAttribution, getListingCoordinates, getMapTiles } from "@/lib/listing-map";
import { applicationHref, earliestListingDate, initialListingStay, listingHref, listingStayError, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { safeSearchReturn } from "@/lib/search-state";
import { formatStayLength, formatUsd, stayPrice } from "@/lib/stay-price";
import { cn } from "@/lib/utils";

export function ListingDetailExperience({ listing, initialStay }: { listing: PreviewListing; initialStay?: Partial<ListingStay> }) {
  const { savedIds, toggleSaved, accountLabel } = useSavedListings();
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
  const stayError = listingStayError(stay, listing);
  // psw: with valid dates the headline is the rent for exactly those dates (whole months + extra days by the month's length).
  const price = stayError ? null : stayPrice(listing.price, stay.moveIn, stay.moveOut);
  const stayDates = stayError ? "选择可租日期" : `${stay.moveIn.replaceAll("-", "/")} – ${stay.moveOut.replaceAll("-", "/")}`;
  const applyHref = applicationHref(listing.id, stay, selectionId);
  const inboxHref = `/inbox?listingId=${encodeURIComponent(listing.id)}`;
  const mapTiles = getMapTiles(getListingCoordinates(listing.area), 12, { width: 900, height: 340 });
  const mapAttribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? defaultMapAttribution;
  const earliestMoveIn = earliestListingDate(listing);
  const availabilityLabel = listing.availableFrom && listing.availableTo > earliestMoveIn ? `${earliestMoveIn} 可入住` : "租期待确认";
  const moveInTags = [...listing.tags.filter((tag) => !tag.includes("入住")), availabilityLabel];
  const amenities = listing.tags.filter((tag) => !tag.includes("入住") && tag !== "房东知情");
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

  return (
    <main className="bg-background pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="mx-auto max-w-[1320px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-3">
          <Link href={returnHref} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-ink-secondary hover:bg-surface-subtle"><ArrowLeft className="size-4" />返回搜索</Link>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void shareListing()} className="flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-ink-secondary hover:bg-surface-subtle"><Share2 className="size-4" />{shareStatus ?? "分享"}</button>
            <button type="button" onClick={() => toggleSaved(listing.id)} className={cn("flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold hover:bg-surface-subtle", saved ? "text-primary-text" : "text-ink-secondary")} aria-label={saved ? "取消收藏房源" : "收藏房源"}>
              <Heart className={cn("size-4", saved && "fill-current")} />{saved ? "已收藏" : "收藏"}
            </button>
          </div>
        </div>

        <ListingPhotoGallery listing={listing} />

        <nav aria-label="房源详情章节" className="sticky top-[72px] z-30 -mx-4 mt-5 flex gap-6 overflow-x-auto border-b border-line-strong bg-background px-4 py-4 text-sm font-semibold text-ink-secondary sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {[["listing-overview", "房源概况"], ["listing-highlights", "租期与亮点"], ["listing-amenities", "设施"], ["listing-location", "位置与通勤"]].map(([id, label]) => <a key={id} href={`#${id}`} className="shrink-0 hover:text-primary-text">{label}</a>)}
        </nav>

        <div className="grid gap-10 pb-20 pt-9 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-16">
          <div className="min-w-0">
            <section id="listing-overview" className="scroll-mt-40 border-b border-line-strong pb-8">
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                {listing.trust ? <span className="rounded-psw-sm bg-tag-neutral px-2.5 py-1.5 text-ink-secondary"><ShieldCheck className="mr-1 inline size-3.5" />{listing.trust}</span> : null}
                <span className="rounded-psw-sm bg-primary-soft px-2.5 py-1.5 text-primary-text">{availabilityLabel}</span>
              </div>
              <h1 className="mt-5 text-balance text-3xl font-black leading-[1.06] tracking-[-0.01em] text-ink sm:text-5xl">{listing.title}</h1>
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-ink-secondary"><MapPin className="size-4 text-primary-text" />{listing.area}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-semibold text-ink-secondary">
                <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-ink-placeholder" />{listing.beds} 间卧室</span>
                <span className="flex items-center gap-1.5"><Bath className="size-4 text-ink-placeholder" />{listing.baths} 间卫浴</span>
                <span className="flex items-center gap-1.5"><Star className="size-4 fill-warning text-warning" />{listing.score} 评分</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 lg:hidden">
                <Link href={`${inboxHref}&tour=1`} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-soft p-3 font-rounded text-sm font-bold text-primary-text"><CalendarDays className="size-4" />预约看房</Link>
                <Link href={inboxHref} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary-soft p-3 font-rounded text-sm font-bold text-primary-text"><MessageCircle className="size-4" />联系房东</Link>
              </div>
            </section>

            <section className="border-b border-line-strong py-8">
              <div className="flex items-center gap-4">
                <div className="relative size-14 overflow-hidden rounded-full bg-primary-soft"><span className="absolute inset-0 grid place-items-center text-lg font-black text-primary-text">L</span></div>
                <div className="min-w-0 flex-1"><h2 className="font-black">平台房东发布</h2><p className="mt-1 text-sm text-ink-secondary">可通过站内消息确认身份、租期与看房安排</p></div>
                <BadgeCheck className="size-6 text-primary-text" aria-label="房源资料已记录" />
              </div>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 id="listing-highlights" className="scroll-mt-40 text-2xl font-black tracking-[-0.01em]">为什么值得看看</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  [TrainFront, "通勤轻松", listing.commute],
                  [CalendarDays, "租期清楚", `${listing.availableFrom} 至 ${listing.availableTo}`],
                  [ShieldCheck, "信任状态", listing.trust],
                  [Sparkles, "入住条件", moveInTags.join(" · ")]
                ].map(([Icon, title, detail]) => {
                  const ItemIcon = Icon as typeof TrainFront;
                  return <div key={String(title)} className="flex gap-3 rounded-[20px] bg-surface-muted p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary-text shadow-sm"><ItemIcon className="size-5" /></span><div><h3 className="text-sm font-black">{String(title)}</h3><p className="mt-1 text-sm leading-6 text-ink-secondary">{String(detail)}</p></div></div>;
                })}
              </div>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 className="text-2xl font-black tracking-[-0.01em]">关于这个家</h2>
              <p className="mt-5 max-w-3xl text-base leading-8 text-ink-secondary">房源的租期、价格、设施、交通与信任状态已汇总在本页。申请前建议通过站内消息确认细节，并按需预约看房。</p>
            </section>

            <section className="border-b border-line-strong py-8">
              <h2 id="listing-amenities" className="scroll-mt-40 text-2xl font-black tracking-[-0.01em]">房源设施</h2>
              {amenities.length ? <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {amenities.map((item) => <li key={item} className="flex items-center gap-3 text-sm font-semibold text-ink-secondary"><Check className="size-5 text-primary-text" />{item}</li>)}
              </ul> : <p className="mt-5 text-sm text-ink-secondary">房东暂未补充设施信息，可在站内消息中确认。</p>}
            </section>

            <section className="py-8">
              <h2 id="listing-location" className="scroll-mt-40 text-2xl font-black tracking-[-0.01em]">位置与通勤</h2>
              <div className="relative mt-6 h-[340px] overflow-hidden rounded-[26px] bg-line-strong" aria-label="房源位置地图">
                <div className="absolute left-1/2 top-0 h-[340px] w-[900px] -translate-x-1/2">
                  {mapTiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}
                </div>
                <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-surface bg-primary text-white shadow-xl"><Building2 className="size-6" /></div>
                <div className="absolute bottom-4 left-4 rounded-[18px] bg-surface/94 p-4 text-sm shadow-lg"><p className="font-black">{listing.area}</p><p className="mt-1 text-xs text-ink-secondary">准确地址将在申请流程中按规则展示</p></div>
                <span className="absolute bottom-2 right-3 rounded bg-surface/85 px-1.5 py-0.5 text-[10px] font-semibold text-ink-secondary">{mapAttribution}</span>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-[148px] rounded-psw-xl bg-surface p-6 shadow-menu">
              <div className="flex items-baseline justify-between gap-4"><p><span className="font-display text-[28px] font-extrabold leading-none text-primary-text">{formatUsd(listing.price)}</span><span className="text-sm text-ink-secondary"> / 月</span></p><span className="flex items-center gap-1 text-sm font-bold"><Star className="size-4 fill-warning text-warning" />{listing.score}</span></div>
              <h2 className="mt-5 text-sm font-bold">你的日期</h2>
              <div className="mt-2"><ListingStayFields listing={listing} stay={stay} onChange={updateStay} /></div>
              {stayError ? <p role="alert" className="mt-3 text-sm leading-6 text-danger-text">{stayError}</p> : <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-success-text"><Check className="size-3.5" />所选租期可申请</p>}
              <div className="mt-5 border-t border-line-strong pt-5">
                <div className="flex items-center justify-between"><h2 className="text-sm font-bold">费用明细</h2><span className="text-xs text-ink-secondary">零头按当月天数折算</span></div>
                <dl className="mt-4 space-y-3 text-sm">
                  {price ? <>
                    {price.wholeMonths ? <div className="flex justify-between gap-3 text-ink-secondary"><dt>房租 {formatUsd(listing.price)} × {price.wholeMonths} 个月</dt><dd className="font-display font-bold text-ink">{formatUsd(listing.price * price.wholeMonths)}</dd></div> : null}
                    {price.extraDays ? <div className="flex justify-between gap-3 text-ink-secondary"><dt>另外 {price.extraDays} 天（按当月 {price.extraPeriodDays} 天折算）</dt><dd className="font-display font-bold text-ink">{formatUsd(price.extraAmount)}</dd></div> : null}
                  </> : <div className="flex justify-between gap-3 text-ink-secondary"><dt>月租</dt><dd className="font-display font-bold text-ink">{formatUsd(listing.price)}</dd></div>}
                  <div className="flex justify-between gap-3 text-ink-secondary"><dt>平台服务</dt><dd>申请接受后确认</dd></div>
                  <div className="flex justify-between gap-3 border-t border-line-strong pt-3 font-bold"><dt>申请时支付</dt><dd className="font-display">$0</dd></div>
                </dl>
              </div>
              {/* psw 决定块: 夜墨底、青柠总价、青柠「申请租住」, the same block as the phone's bottom bar. */}
              <div className="mt-5 rounded-psw-lg bg-ink-block p-5 text-white">
                <p className="text-sm text-on-dark-secondary">{price ? `房租总价 · ${formatStayLength(price)}` : "选好日期后显示总价"}</p>
                <p className="font-display text-[32px] font-extrabold leading-10 text-accent">{price ? formatUsd(price.total) : `${formatUsd(listing.price)}/月`}</p>
                {price ? <p className="text-sm text-on-dark-secondary">月租 {formatUsd(listing.price)} · 零头按当月天数折算</p> : null}
                {stayError ? <button disabled className="mt-4 w-full rounded-full bg-on-dark/10 px-5 py-3.5 font-rounded text-sm font-bold text-on-dark-secondary">请先确认租期</button> : <Link href={applyHref} className="mt-4 flex w-full items-center justify-center rounded-full bg-accent px-5 py-3.5 font-rounded text-base font-bold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline-white">申请租住</Link>}
              </div>
              <p className="mt-3 text-center text-xs text-ink-secondary">提交申请不会立即扣款</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link href={`${inboxHref}&tour=1`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary-soft px-3 py-2.5 font-rounded text-xs font-bold text-primary-text hover:bg-primary-soft-hover"><CalendarDays className="size-4" />预约看房</Link>
                <Link href={inboxHref} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary-soft px-3 py-2.5 font-rounded text-xs font-bold text-primary-text hover:bg-primary-soft-hover"><MessageCircle className="size-4" />联系房东</Link>
              </div>
              <p className="mt-4 text-center text-[11px] leading-5 text-ink-secondary">{accountLabel}</p>
            </div>
          </aside>
        </div>
      </div>

      {/* psw 决定块 on phones: 夜墨 bar, 青柠 total and 青柠「申请租住」. Only the dates are tappable. */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-ink-block px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 text-white shadow-[0_-8px_30px_rgba(29,22,64,0.18)] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-baseline gap-1.5"><span className="text-xs text-on-dark-secondary">{price ? "总价" : "月租"}</span><span className="font-display text-[22px] font-extrabold leading-7 text-accent">{formatUsd(price ? price.total : listing.price)}</span>{price ? null : <span className="text-xs text-on-dark-secondary">/ 月</span>}</p>
            <p className="flex min-w-0 items-center gap-1 text-xs text-on-dark-secondary"><button type="button" aria-label="编辑租期" onClick={() => setStayOpen(true)} className="min-h-7 shrink-0 truncate font-semibold text-white underline underline-offset-4">{stayDates}</button>{price ? <span className="truncate">· {formatStayLength(price)}</span> : null}</p>
          </div>
          {stayError ? <button type="button" onClick={() => setStayOpen(true)} className="flex shrink-0 basis-[44%] items-center justify-center rounded-full bg-accent px-5 py-3.5 font-rounded text-sm font-bold text-on-accent">选择租期</button> : <Link href={applyHref} className="flex shrink-0 basis-[44%] items-center justify-center rounded-full bg-accent px-5 py-3.5 font-rounded text-base font-bold text-on-accent hover:bg-accent-hover">申请租住</Link>}
        </div>
      </div>

      {stayOpen ? <ListingStayDialog listing={listing} stay={stay} onClose={() => setStayOpen(false)} onApply={(value) => { updateStay(value); setStayOpen(false); }} /> : null}
    </main>
  );
}

function newSelectionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
