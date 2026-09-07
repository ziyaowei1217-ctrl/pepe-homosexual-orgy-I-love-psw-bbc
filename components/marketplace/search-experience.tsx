"use client";

import { ArrowLeft, ArrowRight, Bath, BedDouble, CalendarDays, Check, ChevronDown, Heart, LayoutGrid, List, Map, MapPin, Search, SlidersHorizontal, Star, TrainFront, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { SearchFiltersDialog, type SearchFilterSection } from "@/components/marketplace/search-filters";
import { SearchResultsMap } from "@/components/marketplace/search-results-map";
import type { CatalogSort } from "@/lib/listing-catalog";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref } from "@/lib/listing-stay";
import { defaultSearch, emptyFilters, parseSearchState, searchCatalog, searchDateError, searchHref, type SearchState } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export function SearchExperience({ listings, initialQuery, initialMoveIn, initialMoveOut, initialState }: {
  listings: PreviewListing[]; initialQuery: string; initialMoveIn: string; initialMoveOut: string; initialState?: SearchState;
}) {
  const [state, setState] = useState<SearchState>(() => typeof window !== "undefined" && window.location.pathname === "/search" ? parseSearchState(new URLSearchParams(window.location.search)) : initialState ?? { ...defaultSearch, query: initialQuery, moveIn: initialMoveIn, moveOut: initialMoveOut });
  const [filterOpen, setFilterOpen] = useState<SearchFilterSection | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const cards = useRef(new globalThis.Map<string, HTMLElement>());
  const { savedIds, toggleSaved } = useSavedListings();
  const catalog = useMemo(() => searchCatalog(listings, state), [listings, state]);
  const dateError = searchDateError(state.moveIn, state.moveOut);
  const activeId = hoveredId ?? state.selected;
  const activeListing = catalog.items.find((listing) => listing.id === activeId);
  const filterCount = state.amenities.length + Number(Boolean(state.priceMin || state.priceMax)) + Number(Boolean(state.beds));

  useEffect(() => {
    if (window.matchMedia?.("(max-width: 1023px)").matches) {
      setState((current) => current.view === "split" ? { ...current, view: "list" } : current);
    }
    const selected = initialState?.selected;
    if (selected) cards.current.get(selected)?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [initialState?.selected]);

  useEffect(() => {
    const onBack = () => { setState(parseSearchState(new URLSearchParams(window.location.search))); setHoveredId(null); setFilterOpen(null); };
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function update(patch: Partial<SearchState>, history: "push" | "replace" = "push") {
    const next = { ...state, page: 1, selected: "", ...patch };
    setState(next);
    setHoveredId(null);
    const href = searchHref(next);
    if (href !== window.location.pathname + window.location.search) {
      if (history === "replace") window.history.replaceState(null, "", href);
      else window.history.pushState(null, "", href);
    }
  }

  function selectListing(id: string, scroll = false) {
    update({ selected: id, page: state.page }, "replace");
    if (scroll) cards.current.get(id)?.scrollIntoView?.({ behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
  }

  function saveListing(listing: PreviewListing) {
    toggleSaved(listing.id);
    setNotice(savedIds.has(listing.id) ? "已从收藏移除" : "已加入此设备上的收藏");
  }

  function rememberSearch(id: string) {
    try { sessionStorage.setItem("sublet:last-search", searchHref({ ...state, selected: id })); } catch { /* Browsing still works when storage is unavailable. */ }
    selectListing(id);
  }

  const dateLabel = state.moveIn && state.moveOut ? `${state.moveIn.slice(5).replace("-", "/")} – ${state.moveOut.slice(5).replace("-", "/")}` : "租期";
  const budgetLabel = state.priceMin || state.priceMax ? `$${state.priceMin.toLocaleString()} – ${state.priceMax ? `$${state.priceMax.toLocaleString()}` : "不限"}` : "每月预算";
  const chips = [
    ...(state.priceMin || state.priceMax ? [{ label: budgetLabel, clear: () => update({ priceMin: 0, priceMax: 0 }) }] : []),
    ...(state.beds ? [{ label: `${state.beds}+ 间卧室`, clear: () => update({ beds: 0 }) }] : []),
    ...state.amenities.map((amenity) => ({ label: amenity, clear: () => update({ amenities: state.amenities.filter((value) => value !== amenity) }) })),
    ...(state.moveIn || state.moveOut ? [{ label: dateLabel, clear: () => update({ moveIn: "", moveOut: "" }) }] : [])
  ];

  return <main className="search-workspace min-h-[calc(100dvh-72px)] bg-white">
    <section className="search-toolbar sticky top-[72px] z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:gap-4 lg:px-8 lg:py-4">
        <form action="/search" aria-label="修改搜索" onSubmit={(event) => { event.preventDefault(); update({}, "replace"); }} className="flex min-w-0 items-center gap-3 rounded-full border border-slate-300 bg-white p-1.5 pl-4 shadow-sm focus-within:border-slate-600 lg:w-[370px] lg:shrink-0">
          <MapPin className="size-4 shrink-0 text-[#0668e1]" aria-hidden="true" />
          <div className="min-w-0 flex-1"><LocationAutocomplete name="q" value={state.query} onValueChange={(query) => update({ query }, "replace")} inputClassName="text-sm font-semibold" ariaLabel="地点或学校" placeholder="城市、学校或公司" /></div>
          {state.query ? <button type="button" onClick={() => update({ query: "" })} aria-label="清除地点" className="grid size-7 shrink-0 place-items-center rounded-full hover:bg-slate-100"><X className="size-3.5" /></button> : null}
          <button type="submit" aria-label="更新搜索" className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0668e1] text-white"><Search className="size-4" /></button>
        </form>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none]">
          <button type="button" onClick={() => setFilterOpen("budget")} className={cn("search-pill", (state.priceMin || state.priceMax) && "search-pill-active")}>{budgetLabel}<ChevronDown className="size-3.5" /></button>
          <button type="button" onClick={() => setFilterOpen("beds")} className={cn("search-pill", state.beds && "search-pill-active")}><BedDouble className="size-4" />{state.beds ? `${state.beds}+ 卧室` : "卧室"}<ChevronDown className="size-3.5" /></button>
          <button type="button" onClick={() => setFilterOpen("dates")} className={cn("search-pill", (state.moveIn || state.moveOut) && "search-pill-active")}><CalendarDays className="size-4" />{dateLabel}<ChevronDown className="size-3.5" /></button>
          <button type="button" onClick={() => setFilterOpen("budget")} aria-label="筛选" className={cn("search-pill order-first lg:order-none", filterCount && "search-pill-active")}><SlidersHorizontal className="size-4" /><span>筛选</span>{filterCount ? <span className="grid size-5 place-items-center rounded-full bg-[#0668e1] text-[10px] text-white">{filterCount}</span> : null}</button>
        </div>
        <Link href="/saved" className="ml-auto hidden shrink-0 items-center gap-2 text-sm font-semibold text-slate-700 xl:flex"><Heart className="size-4" />我的收藏{savedIds.size ? ` (${savedIds.size})` : ""}</Link>
      </div>
    </section>

    <div className={cn("mx-auto grid max-w-[1920px]", state.view === "split" && "lg:grid-cols-[minmax(480px,0.95fr)_minmax(0,1.05fr)]")}>
      <section className={cn("min-w-0 px-4 pb-28 pt-6 sm:px-6 lg:px-8", state.view === "map" && "hidden")} aria-labelledby="result-heading">
        <div className="flex items-center gap-2 text-xs text-slate-400"><Link href="/" className="hover:text-slate-950">首页</Link><span>/</span><span>房源列表</span>{state.query ? <><span>/</span><span className="truncate text-slate-600">{state.query}</span></> : null}</div>
        <div className="mt-4 flex items-start justify-between gap-3">
          <div><h1 id="result-heading" className="text-[25px] font-bold leading-tight tracking-tight text-slate-950 sm:text-[30px]">{catalog.heading}</h1><p className="mt-2 text-sm text-slate-500" role="status" aria-live="polite"><strong className="font-semibold text-slate-950">{catalog.total} 套</strong>符合条件 · 按月租住，自在安顿</p></div>
        </div>
        {dateError ? <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{dateError}</p> : null}
        {chips.length ? <div className="mt-4 flex flex-wrap gap-2" aria-label="已选条件">{chips.map((chip) => <button key={chip.label} type="button" aria-label={`移除 ${chip.label}`} onClick={chip.clear} className="flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">{chip.label}<X className="size-3" /></button>)}<button type="button" onClick={() => update({ ...emptyFilters, moveIn: "", moveOut: "" })} className="px-2 text-xs font-semibold text-slate-600 underline">重置条件</button></div> : null}
        <div className="mt-5 flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><span className="size-1.5 rounded-full bg-emerald-500" />价格以美元 / 月显示</div>
          <label className="flex items-center gap-1 text-xs text-slate-500">排序<select value={state.sort} onChange={(event) => update({ sort: event.target.value as CatalogSort })} aria-label="结果排序" className="max-w-[140px] bg-transparent font-semibold text-slate-900 outline-none"><option value="recommended">推荐优先</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option><option value="rating">评分优先</option></select></label>
        </div>
        {catalog.items.length ? <div className={cn("mt-5 grid gap-x-5 gap-y-7", state.view === "list" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2")}>
          {catalog.items.map((listing, index) => <article key={listing.id} ref={(node) => { if (node) cards.current.set(listing.id, node); else cards.current.delete(listing.id); }} id={`result-${listing.id}`} className={cn("group min-w-0 scroll-mt-[210px] rounded-[20px] transition-shadow", activeId === listing.id && "outline outline-2 outline-offset-[7px] outline-[#0668e1]")} onMouseEnter={() => setHoveredId(listing.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(listing.id)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredId(null); }}>
            <div className="relative aspect-[1.42] overflow-hidden rounded-[18px] bg-slate-100">
              <Link href={listingHref(listing.id, state)} onClick={() => rememberSearch(listing.id)} className="absolute inset-0"><Image src={listing.image} alt={listing.title} fill priority={index < 2} sizes={state.view === "list" ? "(max-width: 640px) 100vw, 30vw" : "(max-width: 640px) 100vw, (max-width: 1200px) 45vw, 25vw"} className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" /></Link>
              {listing.tags.includes("带家具") ? <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-bold text-slate-800 shadow-sm">带家具 · 轻松入住</span> : null}
              <button type="button" onClick={() => saveListing(listing)} aria-label={savedIds.has(listing.id) ? `取消收藏 ${listing.title}` : `收藏 ${listing.title}`} aria-pressed={savedIds.has(listing.id)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-white/95 text-slate-700 shadow-sm transition-transform hover:scale-110"><Heart className={cn("size-[18px]", savedIds.has(listing.id) && "fill-[#0668e1] text-[#0668e1]")} /></button>
              <button type="button" onClick={() => { update({ view: "map", selected: listing.id, page: state.page }); }} className="absolute bottom-3 right-3 flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold shadow-sm lg:opacity-0 lg:group-focus-within:opacity-100 lg:group-hover:opacity-100"><MapPin className="size-3" />在地图上查看</button>
            </div>
            <Link href={listingHref(listing.id, state)} onClick={() => rememberSearch(listing.id)} className="mt-3 block">
              <div className="flex items-baseline justify-between gap-2"><p><span className="text-[23px] font-bold tracking-tight">${listing.price.toLocaleString()}</span><span className="ml-1 text-xs text-slate-500">/ 月</span></p><span className="flex items-center gap-1 text-xs font-medium"><Star className="size-3 fill-slate-900" />{listing.score}</span></div>
              <h2 className="mt-1.5 truncate text-[14px] font-semibold text-slate-950 group-hover:text-[#0668e1]">{listing.title}</h2>
              <p className="mt-1 truncate text-xs text-slate-500">{listing.area}</p>
              <div className="mt-2 flex items-center gap-3 text-xs text-slate-600"><span className="flex items-center gap-1"><BedDouble className="size-3.5" />{listing.beds} 卧</span><span className="flex items-center gap-1"><Bath className="size-3.5" />{listing.baths} 卫</span><span className="truncate">{listing.tags.slice(0, 2).join(" · ")}</span></div>
              <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-slate-500"><TrainFront className="size-3.5 shrink-0" />{listing.commute}</p>
              {listing.availableFrom && listing.availableTo ? <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">可租 {listing.availableFrom.replaceAll("-", "/")} — {listing.availableTo.replaceAll("-", "/")}</p> : null}
            </Link>
          </article>)}
        </div> : <div className="mt-7 rounded-3xl bg-slate-50 px-5 py-16 text-center"><Search className="mx-auto size-8 text-slate-400" /><h2 className="mt-5 text-xl font-bold">没有找到符合条件的房源</h2><p className="mt-2 text-sm leading-6 text-slate-500">试试调整预算、选择其他日期，或扩大找房区域。</p><button type="button" onClick={() => update({ ...defaultSearch, view: state.view })} className="mt-6 rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white">清除筛选</button></div>}
        {catalog.pageCount > 1 ? <nav aria-label="房源分页" className="mt-10 flex items-center justify-center gap-5"><button type="button" disabled={catalog.page <= 1} onClick={() => { update({ page: catalog.page - 1 }); window.scrollTo({ top: 0 }); }} aria-label="上一页" className="grid size-10 place-items-center rounded-full border border-slate-200 disabled:opacity-30"><ArrowLeft className="size-4" /></button><span className="text-sm text-slate-600">第 {catalog.page} / {catalog.pageCount} 页</span><button type="button" disabled={catalog.page >= catalog.pageCount} onClick={() => { update({ page: catalog.page + 1 }); window.scrollTo({ top: 0 }); }} aria-label="下一页" className="grid size-10 place-items-center rounded-full border border-slate-200 disabled:opacity-30"><ArrowRight className="size-4" /></button></nav> : null}
      </section>
      <SearchResultsMap key={`${catalog.items.map((item) => item.id).join(",")}:${state.view}`} listings={catalog.items} activeListing={activeListing} stay={state} view={state.view} onSelect={(id) => selectListing(id, state.view === "split")} onOpen={rememberSearch} onClose={() => update({ selected: "", page: state.page }, "replace")} page={catalog.page} pageCount={catalog.pageCount} onPageChange={(page) => update({ page })} />
    </div>
    <div className="fixed bottom-[82px] left-1/2 z-40 flex -translate-x-1/2 rounded-full bg-slate-950 p-1 text-white shadow-xl md:bottom-6" aria-label="浏览方式">
      {([["split", "分屏", LayoutGrid], ["list", "列表", List], ["map", "地图", Map]] as const).map(([view, label, Icon]) => <button key={view} type="button" onClick={() => update({ view, page: state.page, selected: state.selected })} aria-pressed={state.view === view} className={cn("flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold", state.view === view ? "bg-white text-slate-950" : "text-slate-200 hover:bg-slate-800", view === "split" && "hidden lg:flex")}><Icon className="size-3.5" />{label}</button>)}
    </div>
    {notice ? <div role="status" className="fixed bottom-[144px] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-xl bg-slate-950 px-5 py-3 text-sm text-white shadow-xl md:bottom-24"><Check className="size-4 text-emerald-300" />{notice}<Link href="/saved" className="ml-2 underline">查看</Link></div> : null}
    {filterOpen ? <SearchFiltersDialog initialSection={filterOpen} initial={state} prices={searchCatalog(listings, { ...state, ...emptyFilters, page: 1 }, Number.MAX_SAFE_INTEGER).items.map((listing) => listing.price)} getCount={(draft) => searchCatalog(listings, draft).total} onApply={(draft) => { update({ ...draft, page: 1, selected: "" }); setFilterOpen(null); }} onClose={() => setFilterOpen(null)} /> : null}
  </main>;
}
