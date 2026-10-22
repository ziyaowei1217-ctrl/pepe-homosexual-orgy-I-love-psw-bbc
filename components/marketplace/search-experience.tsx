"use client";

import { ArrowLeft, ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Heart, LayoutGrid, List, Map, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { ListingCard } from "@/components/marketplace/listing-card";
import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import { MatchPreferencesDialog } from "@/components/marketplace/match-preferences-dialog";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { SearchFiltersDialog, type SearchFilterSection } from "@/components/marketplace/search-filters";
import { SearchResultsMap } from "@/components/marketplace/search-results-map";
import { useListingMatches } from "@/components/marketplace/use-listing-matches";
import { formatRangeLong } from "@/lib/date-format";
import type { CatalogSort } from "@/lib/listing-catalog";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref } from "@/lib/listing-stay";
import { describeRenterPreferences, hasRenterPreferences } from "@/lib/renter-preferences";
import { defaultSearch, emptyFilters, parseSearchState, searchCatalog, searchDateError, searchHref, type SearchState } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export function SearchExperience({ listings, initialQuery, initialMoveIn, initialMoveOut, initialState }: {
  listings: PreviewListing[]; initialQuery: string; initialMoveIn: string; initialMoveOut: string; initialState?: SearchState;
}) {
  const [state, setState] = useState<SearchState>(() => initialState ?? { ...defaultSearch, query: initialQuery, moveIn: initialMoveIn, moveOut: initialMoveOut });
  const [filterOpen, setFilterOpen] = useState<SearchFilterSection | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const cards = useRef(new globalThis.Map<string, HTMLElement>());
  const { savedIds, toggleSaved } = useSavedListings();
  const { savedPreferences, savePreferences, preferences, matches } = useListingMatches(listings, state);
  const catalog = useMemo(() => searchCatalog(listings, state, 24, (listing) => matches.get(listing.id)?.score), [listings, state, matches]);
  const dateError = searchDateError(state.moveIn, state.moveOut);
  // psw: once dates are chosen every card shows the rent for exactly those dates, so totals compare directly.
  const stayIn = state.moveIn && state.moveOut && !dateError ? state.moveIn : "";
  const stayOut = stayIn ? state.moveOut : "";
  const activeId = hoveredId ?? state.selected;
  const activeListing = catalog.items.find((listing) => listing.id === activeId);
  const filterCount = state.amenities.length + Number(Boolean(state.priceMin || state.priceMax)) + Number(Boolean(state.beds));

  useEffect(() => {
    // Read the address bar after commit, not during render: on a client navigation the router has not
    // updated it yet during render, while a restored history entry may carry filters added via pushState.
    if (window.location.pathname === "/search") {
      const fromUrl = parseSearchState(new URLSearchParams(window.location.search));
      setState((current) => searchHref(fromUrl) === searchHref(current) ? current : fromUrl);
    }
    if (window.matchMedia?.("(max-width: 1023px)").matches) {
      setState((current) => current.view === "split" ? { ...current, view: "list" } : current);
    }
    const selected = initialState?.selected;
    if (selected) cards.current.get(selected)?.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [initialState?.selected]);

  // Client-side navigation to a /search URL that matches the mounted key (e.g. the "找房" nav link
  // after filters were pushed with history.pushState) re-renders with a fresh initialState but no remount.
  const mountedInitialState = useRef(initialState);
  useEffect(() => {
    if (mountedInitialState.current === initialState) return;
    mountedInitialState.current = initialState;
    if (initialState) {
      const compact = window.matchMedia?.("(max-width: 1023px)").matches && initialState.view === "split";
      setState(compact ? { ...initialState, view: "list" } : initialState);
      setHoveredId(null);
      setFilterOpen(null);
    }
  }, [initialState]);

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

  const dateLabel = state.moveIn && state.moveOut ? formatRangeLong(state.moveIn, state.moveOut) : "选日期";
  const budgetLabel = state.priceMin || state.priceMax ? `$${state.priceMin.toLocaleString("en-US")} – ${state.priceMax ? `$${state.priceMax.toLocaleString("en-US")}` : "不限"}` : "每月预算";
  const chips = [
    ...(state.moveIn || state.moveOut ? [{ label: dateLabel, clear: () => update({ moveIn: "", moveOut: "" }) }] : []),
    ...(state.priceMin || state.priceMax ? [{ label: budgetLabel, clear: () => update({ priceMin: 0, priceMax: 0 }) }] : []),
    ...(state.beds ? [{ label: `${state.beds}+ 间卧室`, clear: () => update({ beds: 0 }) }] : []),
    ...state.amenities.map((amenity) => ({ label: amenity, clear: () => update({ amenities: state.amenities.filter((value) => value !== amenity) }) }))
  ];

  return <main className="search-workspace min-h-[calc(100dvh-72px)] bg-background">
    {/* On phones the site header scrolls away and only this toolbar stays, so results keep most of the screen. */}
    <section className="search-toolbar sticky top-0 z-40 border-b border-line-strong bg-surface md:top-[72px]">
      <div className="mx-auto flex max-w-[1920px] flex-col gap-2 px-4 py-2 sm:px-6 lg:flex-row lg:items-center lg:gap-4 lg:px-8 lg:py-4">
        <form action="/search" aria-label="修改搜索" onSubmit={(event) => { event.preventDefault(); update({}, "replace"); }} className="flex min-w-0 items-center gap-3 rounded-full border-[1.5px] border-ink bg-surface p-1 pl-4 lg:w-[380px] lg:shrink-0 lg:p-1.5 lg:pl-4">
          <MapPin className="size-4 shrink-0 text-primary-text" aria-hidden="true" />
          <div className="min-w-0 flex-1"><LocationAutocomplete name="q" value={state.query} onValueChange={(query) => update({ query }, "replace")} inputClassName="text-base font-semibold lg:text-sm" ariaLabel="地点或学校" placeholder="城市、学校或公司" /></div>
          {state.query ? <button type="button" onClick={() => update({ query: "" })} aria-label="清除地点" className="tap-target grid size-7 shrink-0 place-items-center rounded-full hover:bg-surface-subtle"><X className="size-3.5" /></button> : null}
          <button type="submit" aria-label="更新搜索" className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white transition-colors hover:bg-primary-hover lg:size-10"><Search className="size-4" /></button>
        </form>
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,#000_85%,transparent)] [scrollbar-width:none] lg:[mask-image:none]">
          <button type="button" onClick={() => setFilterOpen("dates")} className={cn("search-pill", (state.moveIn || state.moveOut) && "search-pill-active")}><CalendarDays className="size-4" aria-hidden="true" />{dateLabel}<ChevronDown className="size-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={() => setFilterOpen("budget")} className={cn("search-pill", (state.priceMin || state.priceMax) && "search-pill-active")}>{budgetLabel}<ChevronDown className="size-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={() => setFilterOpen("beds")} className={cn("search-pill", state.beds && "search-pill-active")}><BedDouble className="size-4" aria-hidden="true" />{state.beds ? `${state.beds}+ 卧室` : "卧室"}<ChevronDown className="size-3.5" aria-hidden="true" /></button>
          <button type="button" onClick={() => setFilterOpen("budget")} aria-label="筛选" className={cn("search-pill", filterCount && "search-pill-active")}><SlidersHorizontal className="size-4" aria-hidden="true" /><span>筛选</span>{filterCount ? <span className="grid size-5 place-items-center rounded-full bg-surface text-[11px] text-primary-text">{filterCount}</span> : null}</button>
        </div>
        <Link href="/saved" className="ml-auto hidden min-h-11 shrink-0 items-center gap-2 text-d-subhead font-semibold text-ink-secondary hover:text-ink xl:flex"><Heart className="size-4" aria-hidden="true" />我的收藏{savedIds.size ? ` (${savedIds.size})` : ""}</Link>
      </div>
    </section>

    <div className={cn("mx-auto grid max-w-[1920px]", state.view === "split" && "lg:grid-cols-[minmax(480px,0.95fr)_minmax(0,1.05fr)]")}>
      <section className={cn("min-w-0 px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:px-8", state.view === "map" && "hidden")} aria-labelledby="result-heading">
        <div className="hidden items-center gap-2 text-m-footnote text-ink-secondary sm:flex"><Link href="/" className="flex min-h-6 items-center hover:text-ink">首页</Link><span aria-hidden="true">/</span><span>房源列表</span>{state.query ? <><span aria-hidden="true">/</span><span className="truncate">{state.query}</span></> : null}</div>
        <div className="mt-1 sm:mt-3">
          <h1 id="result-heading" className="page-title">{catalog.heading}</h1>
          <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead" role="status" aria-live="polite"><strong className="font-display font-bold text-ink">{catalog.total}</strong> 套符合条件{stayIn ? ` · ${formatRangeLong(stayIn, stayOut)}` : ""}</p>
        </div>
        {dateError ? <p role="alert" className="mt-3 rounded-psw-md bg-warning-soft px-3 py-2 text-d-subhead text-warning-text">{dateError}</p> : null}
        {chips.length ? <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="已选条件">{chips.map((chip) => <button key={chip.label} type="button" aria-label={`移除 ${chip.label}`} onClick={chip.clear} className="tap-target flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-m-footnote font-semibold text-on-primary hover:bg-primary-hover">{chip.label}<X className="size-3.5" aria-hidden="true" /></button>)}<button type="button" onClick={() => update({ ...emptyFilters, moveIn: "", moveOut: "" })} className="min-h-11 px-2 text-m-footnote font-semibold text-ink-secondary underline underline-offset-4">重置条件</button></div> : null}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-line-strong pb-4">
          <p className="flex items-center gap-2 text-m-footnote text-ink-secondary"><span className="size-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{stayIn ? "总价：整月按月租，零头按当月天数折算" : "价格按月租显示，选好日期后显示总价"}</p>
          <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-m-footnote text-ink-secondary">排序<select value={state.sort} onChange={(event) => update({ sort: event.target.value as CatalogSort })} aria-label="结果排序" className="min-h-11 max-w-[170px] rounded-full border-[1.5px] border-outline bg-surface px-4 text-base font-bold text-ink outline-none sm:text-sm"><option value="recommended">推荐优先</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option></select></label>
        </div>
        {state.sort === "recommended" ? <p className="mt-3 flex flex-wrap items-center gap-x-2 text-m-footnote text-ink-secondary">{hasRenterPreferences(preferences) ? <span>按匹配度排序：<span className="font-semibold text-ink">{describeRenterPreferences(preferences).join(" · ")}</span></span> : <span>填写学校或公司、预算和日期后，推荐按匹配度排序。</span>}<button type="button" onClick={() => setPreferencesOpen(true)} className="min-h-11 font-semibold text-primary-text underline underline-offset-4">{hasRenterPreferences(savedPreferences) ? "修改匹配偏好" : "设置匹配偏好"}</button></p> : null}
        {catalog.items.length ? <div className={cn("mt-5 grid gap-x-5 gap-y-7", state.view === "list" ? "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]" : "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2")}>
          {catalog.items.map((listing, index) => <ListingCard
            key={listing.id}
            id={`result-${listing.id}`}
            cardRef={(node) => { if (node) cards.current.set(listing.id, node); else cards.current.delete(listing.id); }}
            className="scroll-mt-[210px]"
            listing={listing}
            href={listingHref(listing.id, state)}
            moveIn={stayIn}
            moveOut={stayOut}
            match={matches.get(listing.id)}
            headingLevel={2}
            priority={index < 2}
            sizes={state.view === "list" ? "(max-width: 640px) 100vw, 30vw" : "(max-width: 640px) 100vw, (max-width: 1200px) 45vw, 25vw"}
            active={activeId === listing.id}
            saved={savedIds.has(listing.id)}
            onToggleSave={() => saveListing(listing)}
            onShowOnMap={() => update({ view: "map", selected: listing.id, page: state.page })}
            onOpen={() => rememberSearch(listing.id)}
            onMouseEnter={() => setHoveredId(listing.id)}
            onMouseLeave={() => setHoveredId(null)}
            onFocus={() => setHoveredId(listing.id)}
            onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredId(null); }}
          />)}
        </div> : <EmptyState className="mt-7" mood="curious" title="没有找到符合条件的房源" body="试试调整预算、换一段日期，或者扩大找房区域。" action={<button type="button" onClick={() => update({ ...defaultSearch, view: state.view })} className="min-h-12 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary hover:bg-primary-hover active:scale-[0.97]">清除筛选</button>} />}
        {catalog.pageCount > 1 ? <nav aria-label="房源分页" className="mt-10 flex items-center justify-center gap-5"><button type="button" disabled={catalog.page <= 1} onClick={() => { update({ page: catalog.page - 1 }); window.scrollTo({ top: 0 }); }} aria-label="上一页" className="grid size-11 place-items-center rounded-full border-[1.5px] border-outline bg-surface disabled:opacity-30"><ArrowLeft className="size-4" /></button><span className="text-d-subhead text-ink-secondary">第 {catalog.page} / {catalog.pageCount} 页</span><button type="button" disabled={catalog.page >= catalog.pageCount} onClick={() => { update({ page: catalog.page + 1 }); window.scrollTo({ top: 0 }); }} aria-label="下一页" className="grid size-11 place-items-center rounded-full border-[1.5px] border-outline bg-surface disabled:opacity-30"><ArrowRight className="size-4" /></button></nav> : null}
      </section>
      <SearchResultsMap key={`${catalog.items.map((item) => item.id).join(",")}:${state.view}`} listings={catalog.items} total={catalog.total} activeListing={activeListing} stay={state} view={state.view} onSelect={(id) => selectListing(id, state.view === "split")} onOpen={rememberSearch} onClose={() => update({ selected: "", page: state.page }, "replace")} page={catalog.page} pageCount={catalog.pageCount} onPageChange={(page) => update({ page })} />
    </div>
    <div className="fixed bottom-[82px] left-1/2 z-40 flex -translate-x-1/2 rounded-full bg-ink-block p-1 text-white shadow-menu md:bottom-6" aria-label="浏览方式">
      {([["split", "分屏", LayoutGrid], ["list", "列表", List], ["map", "地图", Map]] as const).map(([view, label, Icon]) => <button key={view} type="button" onClick={() => update({ view, page: state.page, selected: state.selected })} aria-pressed={state.view === view} className={cn("flex min-h-11 items-center gap-2 rounded-full px-4 text-d-subhead font-semibold", state.view === view ? "bg-surface text-ink" : "text-on-dark-secondary hover:bg-on-dark/10", view === "split" && "hidden lg:flex")}><Icon className="size-4" aria-hidden="true" />{label}</button>)}
    </div>
    {notice ? <div role="status" className="fixed bottom-[144px] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-psw-md bg-toast-bg px-5 py-3 text-d-subhead text-on-toast shadow-menu md:bottom-24"><Check className="size-4 text-toast-success" aria-hidden="true" />{notice}<Link href="/saved" className="ml-2 flex min-h-6 items-center font-semibold text-toast-action underline">查看</Link></div> : null}
    {preferencesOpen ? <MatchPreferencesDialog initial={savedPreferences} onSave={(next) => { savePreferences(next); setPreferencesOpen(false); }} onClose={() => setPreferencesOpen(false)} /> : null}
    {filterOpen ? <SearchFiltersDialog initialSection={filterOpen} initial={state} prices={searchCatalog(listings, { ...state, ...emptyFilters, page: 1 }, Number.MAX_SAFE_INTEGER).items.map((listing) => listing.price)} getCount={(draft) => searchCatalog(listings, draft).total} onApply={(draft) => { update({ ...draft, page: 1, selected: "" }); setFilterOpen(null); }} onClose={() => setFilterOpen(null)} /> : null}
  </main>;
}
