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
import Link from "@/components/ui/app-link";
import { useEffect, useState } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { ListingPhotoGallery } from "@/components/marketplace/listing-photo-gallery";
import { ListingStayDialog, ListingStayFields } from "@/components/marketplace/listing-stay-selector";
import { defaultMapAttribution, getListingCoordinates, getMapTiles } from "@/lib/listing-map";
import { applicationHref, earliestListingDate, initialListingStay, listingHref, listingStayError, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { safeSearchReturn } from "@/lib/search-state";
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
    <main className="bg-white pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="mx-auto max-w-[1320px] px-4 pt-5 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={returnHref} className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold sm:px-3 text-slate-600 hover:bg-slate-100"><ArrowLeft className="size-4" />返回搜索</Link>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
            <button type="button" onClick={() => void shareListing()} className="flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold sm:px-3 text-slate-700 hover:bg-slate-100"><Share2 className="size-4" />{shareStatus ?? "分享"}</button>
            <button type="button" onClick={() => toggleSaved(listing.id)} className={cn("flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-2 text-sm font-semibold sm:px-3 hover:bg-slate-100", saved ? "text-[#2453ff]" : "text-slate-700")} aria-label={saved ? "取消收藏房源" : "收藏房源"}>
              <Heart className={cn("size-4", saved && "fill-current")} />{saved ? "已收藏" : "收藏"}
            </button>
          </div>
        </div>

        <ListingPhotoGallery listing={listing} />

        <nav aria-label="房源详情章节" className="sticky top-[72px] z-30 -mx-4 mt-5 flex gap-6 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          {[["listing-overview", "房源概况"], ["listing-highlights", "租期与亮点"], ["listing-amenities", "设施"], ["listing-location", "位置与通勤"]].map(([id, label]) => <a key={id} href={`#${id}`} className="flex min-h-11 shrink-0 items-center hover:text-[#2453ff]">{label}</a>)}
        </nav>

        <div className="grid gap-10 pb-20 pt-9 lg:grid-cols-[minmax(0,1fr)_390px] lg:gap-16">
          <div className="min-w-0">
            <section id="listing-overview" className="scroll-mt-40 border-b border-slate-200 pb-8">
              <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                {listing.trust ? <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-600"><ShieldCheck className="mr-1 inline size-3.5" />{listing.trust}</span> : null}
                <span className="rounded-full bg-brand-soft px-3 py-1.5 text-[#2453ff]">{availabilityLabel}</span>
              </div>
              <h1 className="mt-5 text-balance text-3xl font-semibold leading-[1.2] tracking-[-0.025em] text-brand-ink sm:text-[40px]">{listing.title}</h1>
              <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-500"><MapPin className="size-4 text-[#2453ff]" />{listing.area}</p>
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm font-medium text-brand-ink">
                <span className="flex items-center gap-1.5"><BedDouble className="size-4 text-slate-400" />{listing.beds} 间卧室</span>
                <span className="flex items-center gap-1.5"><Bath className="size-4 text-slate-400" />{listing.baths} 间卫浴</span>
                <span className="flex items-center gap-1.5"><Star className="size-4 fill-amber-400 text-amber-400" />{listing.score} 评分</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 lg:hidden">
                <Link href={`${inboxHref}&tour=1`} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold"><CalendarDays className="size-4" />预约看房</Link>
                <Link href={inboxHref} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-semibold"><MessageCircle className="size-4" />联系房东</Link>
              </div>
            </section>

            <section className="border-b border-slate-200 py-8">
              <div className="flex items-center gap-4">
                <div className="relative size-14 overflow-hidden rounded-full bg-brand-soft"><span className="absolute inset-0 grid place-items-center text-lg font-semibold text-[#2453ff]">L</span></div>
                <div className="min-w-0 flex-1"><h2 className="font-semibold">平台房东发布</h2><p className="mt-1 text-sm text-slate-500">可通过站内消息确认身份、租期与看房安排</p></div>
                <BadgeCheck className="size-6 text-[#2453ff]" aria-label="房源资料已记录" />
              </div>
            </section>

            <section className="border-b border-slate-200 py-8">
              <h2 id="listing-highlights" className="scroll-mt-40 text-2xl font-semibold tracking-[-0.035em]">租期与转租条件</h2>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  [TrainFront, "通勤轻松", listing.commute],
                  [CalendarDays, "租期清楚", `${listing.availableFrom} 至 ${listing.availableTo}`],
                  [ShieldCheck, "信任状态", listing.trust],
                  [Sparkles, "入住条件", moveInTags.join(" · ")]
                ].map(([Icon, title, detail]) => {
                  const ItemIcon = Icon as typeof TrainFront;
                  return <div key={String(title)} className="flex gap-3 border-l-2 border-brand/20 py-2 pl-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[#2453ff]"><ItemIcon className="size-5" /></span><div><h3 className="text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{String(detail)}</p></div></div>;
                })}
              </div>
            </section>

            <section className="border-b border-slate-200 py-8">
              <h2 className="text-2xl font-semibold tracking-[-0.035em]">转租信息</h2>
              <p className="mt-5 max-w-3xl text-base leading-8 text-slate-600">先核对月租、可租日期和学校或实习通勤。申请前，通过站内消息向发布者确认原租约、转租许可、费用和交接安排，并按需预约看房。</p>
            </section>

            <section className="border-b border-slate-200 py-8">
              <h2 id="listing-amenities" className="scroll-mt-40 text-2xl font-semibold tracking-[-0.035em]">房源设施</h2>
              {amenities.length ? <ul className="mt-6 grid gap-4 sm:grid-cols-2">
                {amenities.map((item) => <li key={item} className="flex items-center gap-3 text-sm font-semibold text-slate-700"><Check className="size-5 text-indigo-600" />{item}</li>)}
              </ul> : <p className="mt-5 text-sm text-slate-500">房东暂未补充设施信息，可在站内消息中确认。</p>}
            </section>

            <section className="py-8">
              <h2 id="listing-location" className="scroll-mt-40 text-2xl font-semibold tracking-[-0.035em]">位置与通勤</h2>
              <div className="relative mt-6 h-[340px] overflow-hidden rounded-[20px] bg-[#e6ebf3]" aria-label="房源位置地图">
                <div className="absolute left-1/2 top-0 h-[340px] w-[900px] -translate-x-1/2">
                  {mapTiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}
                </div>
                <div className="absolute left-1/2 top-1/2 grid size-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-[#2453ff] text-white shadow-xl"><Building2 className="size-6" /></div>
                <div className="absolute bottom-4 left-4 rounded-[18px] bg-white/94 p-4 text-sm shadow-lg"><p className="font-semibold">{listing.area}</p><p className="mt-1 text-xs text-slate-500">准确地址将在申请流程中按规则展示</p></div>
                <span className="absolute bottom-2 right-3 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{mapAttribution}</span>
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="listing-booking-card sticky top-[148px] rounded-[20px] border border-brand/15 bg-white p-6 shadow-[0_8px_24px_rgba(36,83,255,0.05)]">
              <div className="flex items-end justify-between gap-4"><p><span className="text-3xl font-semibold tabular-nums tracking-[-0.025em] text-brand-ink">${listing.price.toLocaleString("en-US")}</span><span className="text-sm text-brand-moss"> / 月</span></p><span className="flex items-center gap-1 text-sm font-bold"><Star className="size-4 fill-amber-400 text-amber-400" />{listing.score}</span></div>
              <div className="mt-5"><ListingStayFields listing={listing} stay={stay} onChange={updateStay} /></div>
              {stayError ? <p role="alert" className="mt-3 text-sm leading-6 text-red-700">{stayError}</p> : <p className="mt-3 flex items-center gap-1.5 text-xs text-indigo-700"><Check className="size-3.5" />所选租期可申请</p>}
              {stayError ? <button disabled className="mt-4 w-full rounded-xl bg-slate-200 px-5 py-3.5 text-sm font-bold text-slate-500">请先确认租期</button> : <Link href={applyHref} className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#2453ff] px-5 py-3.5 text-sm font-bold text-white shadow-[0_10px_28px_rgba(36,83,255,0.12)] hover:bg-brand-moss">申请租住</Link>}
              <p className="mt-3 text-center text-xs text-slate-500">提交申请不会立即扣款</p>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">费用明细</h2><span className="text-xs text-slate-400">月度估算</span></div>
                <dl className="mt-4 space-y-3 text-sm tabular-nums"><div className="flex justify-between text-slate-600"><dt>月租</dt><dd>${listing.price.toLocaleString("en-US")}</dd></div><div className="flex justify-between text-slate-600"><dt>平台服务</dt><dd>申请接受后确认</dd></div><div className="flex justify-between border-t border-slate-200 pt-3 font-semibold"><dt>申请时支付</dt><dd>$0</dd></div></dl>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Link href={`${inboxHref}&tour=1`} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><CalendarDays className="size-4" />预约看房</Link>
                <Link href={inboxHref} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"><MessageCircle className="size-4" />联系房东</Link>
              </div>
              <p className="mt-4 text-center text-[11px] leading-5 text-slate-400">{accountLabel}</p>
            </div>
          </aside>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_30px_rgba(15,23,42,0.08)] lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3"><div className="min-w-0 flex-1"><p className="text-lg font-semibold tabular-nums text-brand-ink">${listing.price.toLocaleString("en-US")} <span className="text-xs font-medium text-slate-600">/ 月</span></p><button type="button" aria-label="编辑租期" onClick={(event) => { event.currentTarget.focus(); setStayOpen(true); }} className="block min-h-11 max-w-full truncate text-xs font-semibold text-slate-600 underline underline-offset-4">{stayError ? "选择可租日期" : `${stay.moveIn.replaceAll("-", "/")} – ${stay.moveOut.replaceAll("-", "/")}`}<span className="ml-2 text-[#2453ff]">修改</span></button></div>{stayError ? <button type="button" onClick={(event) => { event.currentTarget.focus(); setStayOpen(true); }} className="shrink-0 rounded-xl bg-[#2453ff] px-5 py-3.5 text-sm font-bold text-white">选择租期</button> : <Link href={applyHref} className="shrink-0 rounded-xl bg-[#2453ff] px-5 py-3.5 text-sm font-bold text-white">申请租住</Link>}</div>
      </div>

      {stayOpen ? <ListingStayDialog listing={listing} stay={stay} onClose={() => setStayOpen(false)} onApply={(value) => { updateStay(value); setStayOpen(false); }} /> : null}
    </main>
  );
}

function newSelectionId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
