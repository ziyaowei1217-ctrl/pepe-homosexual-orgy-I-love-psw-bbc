"use client";

import { ArrowLeft, ArrowRight, BedDouble, CalendarDays, Check, ChevronDown, Heart, LayoutGrid, List, Map, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { ListingCard } from "@/components/marketplace/listing-card";
import { LocationAutocomplete } from "@/components/marketplace/location-autocomplete";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { SearchFiltersDialog, type SearchFilterSection } from "@/components/marketplace/search-filters";
import { SearchResultsMap } from "@/components/marketplace/search-results-map";
import { formatRangeLong } from "@/lib/date-format";
import type { CatalogSort } from "@/lib/listing-catalog";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref } from "@/lib/listing-stay";
import { defaultSearch, emptyFilters, parseSearchState, searchCatalog, searchDateError, searchHref, type SearchState } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export function SearchExperience({ listings, initialQuery, initialMoveIn, initialMoveOut, initialState }: {
  listings: PreviewListing[]; initialQuery: string; initialMoveIn: string; initialMoveOut: string; initialState?: SearchState;
}) {
  const [state, setState] = useState<SearchState>(() => initialState ?? { ...defaultSearch, query: initialQuery, moveIn: initialMoveIn, moveOut: initialMoveOut });
  const [filterOpen, setFilterOpen] = useState<SearchFilterSection | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const cards = useRef(new globalThis.Map<string, HTMLElement>());
  const { savedIds, toggleSaved } = useSavedListings();
  const catalog = useMemo(() => searchCatalog(listings, state), [listings, state]);
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

  // The cards are memoised, so they get the same handlers on every render; the handlers read the latest state.
  const latest = useRef({ save: (_id: string) => {}, showOnMap: (_id: string) => {}, open: (_id: string) => {} });
  useEffect(() => {
    latest.current = {
      save: (id) => { const listing = listings.find((item) => item.id === id); if (listing) saveListing(listing); },
      showOnMap: (id) => update({ view: "map", selected: id, page: state.page }),
      open: (id) => rememberSearch(id)
    };
  });
  const cardActions = useMemo(() => ({
    toggleSave: (id: string) => latest.current.save(id),
    showOnMap: (id: string) => latest.current.showOnMap(id),
    open: (id: string) => latest.current.open(id),
    hover: (id: string | null) => setHoveredId(id),
    register: (id: string, node: HTMLElement | null) => { if (node) cards.current.set(id, node); else cards.current.delete(id); }
  }), []);

  const dateLabel = state.moveIn && state.moveOut ? formatRangeLong(state.moveIn, state.moveOut) : "选日期";
  const budgetLabel = state.priceMin || state.priceMax ? `$${state.priceMin.toLocaleString("en-US")} – ${state.priceMax ? `$${state.priceMax.toLocaleString("en-US")}` : "不限"}` : "每月预算";
  // Dates are not repeated here: the toolbar's date button already shows them and clears them.
  const chips = [
    ...(state.priceMin || state.priceMax ? [{ label: budgetLabel, clear: () => update({ priceMin: 0, priceMax: 0 }) }] : []),
    ...(state.beds ? [{ label: `${state.beds}+ 间卧室`, clear: () => update({ beds: 0 }) }] : []),
    ...state.amenities.map((amenity) => ({ label: amenity, clear: () => update({ amenities: state.amenities.filter((value) => value !== amenity) }) }))
  ];

  const viewSwitch = <div className="flex rounded-full bg-ink-block p-1 text-white shadow-menu" role="group" aria-label="浏览方式">
    {([["split", "分屏", LayoutGrid], ["list", "列表", List], ["map", "地图", Map]] as const).map(([view, label, Icon]) => <button key={view} type="button" onClick={() => update({ view, page: state.page, selected: state.selected })} aria-pressed={state.view === view} className={cn("flex min-h-11 items-center gap-2 rounded-full px-4 text-d-subhead font-semibold", state.view === view ? "bg-surface text-ink" : "text-on-dark-secondary hover:bg-on-dark/10", view === "split" && "hidden lg:flex")}><Icon className="size-4" aria-hidden="true" />{label}</button>)}
  </div>;

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
          <button type="button" onClick={() => setFilterOpen("budget")} aria-label="筛选" className={cn("search-pill", filterCount && "search-pill-active")}><SlidersHorizontal className="size-4" aria-hidden="true" /><span>筛选</span>{filterCount ? <span className="grid size-5 place-items-center rounded-full bg-surface text-m-footnote text-primary-text">{filterCount}</span> : null}</button>
        </div>
        <Link href="/saved" className="ml-auto hidden min-h-11 shrink-0 items-center gap-2 text-d-subhead font-semibold text-ink-secondary hover:text-ink xl:flex"><Heart className="size-4" aria-hidden="true" />我的收藏{savedIds.size ? ` (${savedIds.size})` : ""}</Link>
      </div>
    </section>

    <div className={cn("mx-auto grid max-w-[1920px]", state.view === "split" && "lg:grid-cols-[minmax(480px,0.95fr)_minmax(0,1.05fr)]")}>
      <section className={cn("min-w-0 px-4 pb-28 pt-1 sm:px-6 sm:pt-6 lg:px-8", state.view === "map" && "hidden")} aria-labelledby="result-heading">
        {/* Phones get a title-size heading so the first price is on the first screen. */}
        {/* The results are the page; the heading names them without out-shouting the prices. */}
        <h1 id="result-heading" className="font-rounded text-m-title text-ink sm:mt-2 sm:text-d-title">{catalog.heading}</h1>
        {dateError ? <p role="alert" className="mt-3 rounded-psw-md bg-warning-soft px-3 py-2 text-d-subhead text-warning-text">{dateError}</p> : null}
        {chips.length ? <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="已选条件">{chips.map((chip) => <button key={chip.label} type="button" aria-label={`移除 ${chip.label}`} onClick={chip.clear} className="tap-target flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-m-footnote font-semibold text-on-primary hover:bg-primary-hover">{chip.label}<X className="size-3.5" aria-hidden="true" /></button>)}<button type="button" onClick={() => update({ ...emptyFilters, moveIn: "", moveOut: "" })} className="min-h-11 px-2 text-m-footnote font-semibold text-ink-secondary underline underline-offset-4">重置条件</button></div> : null}
        <div className="mt-2 flex items-center justify-between gap-3 border-b border-line-strong pb-2 sm:mt-4 sm:pb-4">
          <div className="min-w-0">
            <p className="text-m-subhead text-ink-secondary sm:text-d-subhead" role="status" aria-live="polite"><strong className="font-display font-bold text-ink">{catalog.total}</strong> 套符合条件</p>
            <p className="text-m-footnote text-ink-secondary">{stayIn ? "总价：整月按月租，零头按天折算" : "按月租显示，选好日期看总价"}</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 whitespace-nowrap text-m-footnote text-ink-secondary"><span className="sr-only sm:not-sr-only">排序</span><select value={state.sort} onChange={(event) => update({ sort: event.target.value as CatalogSort })} aria-label="结果排序" className="min-h-11 max-w-[170px] rounded-full border-[1.5px] border-outline bg-surface px-4 text-base font-bold text-ink outline-none sm:text-sm"><option value="recommended">推荐优先</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option></select></label>
        </div>
        {catalog.items.length ? <div className={cn("mt-2 grid gap-x-5 gap-y-7 sm:mt-5", state.view === "list" ? "grid-cols-[repeat(auto-fill,minmax(260px,1fr))]" : "sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2")}>
          {catalog.items.map((listing, index) => <ListingCard
            key={listing.id}
            id={`result-${listing.id}`}
            registerCard={cardActions.register}
            // Cards below the fold skip layout and paint until they scroll near the screen.
            className="scroll-mt-[210px] [contain-intrinsic-size:auto_440px] [content-visibility:auto]"
            listing={listing}
            href={listingHref(listing.id, state)}
            moveIn={stayIn}
            moveOut={stayOut}
            headingLevel={2}
            priority={index < 2}
            sizes={state.view === "list" ? "(max-width: 640px) 100vw, 30vw" : "(max-width: 640px) 100vw, (max-width: 1200px) 45vw, 25vw"}
            active={activeId === listing.id}
            saved={savedIds.has(listing.id)}
            onToggleSave={cardActions.toggleSave}
            onShowOnMap={cardActions.showOnMap}
            onOpen={cardActions.open}
            onHoverChange={cardActions.hover}
          />)}
        </div> : <EmptyState className="mt-7" mood="curious" title="没有找到符合条件的房源" body="试试调整预算、换一段日期，或者扩大找房区域。" action={<button type="button" onClick={() => update({ ...defaultSearch, view: state.view })} className="min-h-12 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary hover:bg-primary-hover active:scale-[0.97]">清除筛选</button>} />}
        {catalog.pageCount > 1 ? <nav aria-label="房源分页" className="mt-10 flex items-center justify-center gap-5"><button type="button" disabled={catalog.page <= 1} onClick={() => { update({ page: catalog.page - 1 }); window.scrollTo({ top: 0 }); }} aria-label="上一页" className="grid size-11 place-items-center rounded-full border-[1.5px] border-outline bg-surface disabled:opacity-30"><ArrowLeft className="size-4" /></button><span className="text-d-subhead text-ink-secondary">第 {catalog.page} / {catalog.pageCount} 页</span><button type="button" disabled={catalog.page >= catalog.pageCount} onClick={() => { update({ page: catalog.page + 1 }); window.scrollTo({ top: 0 }); }} aria-label="下一页" className="grid size-11 place-items-center rounded-full border-[1.5px] border-outline bg-surface disabled:opacity-30"><ArrowRight className="size-4" /></button></nav> : null}
      </section>
      <SearchResultsMap key={`${catalog.items.map((item) => item.id).join(",")}:${state.view}`} listings={catalog.items} total={catalog.total} activeListing={activeListing} stay={state} view={state.view} onSelect={(id) => selectListing(id, state.view === "split")} onOpen={rememberSearch} onClose={() => update({ selected: "", page: state.page }, "replace")} page={catalog.page} pageCount={catalog.pageCount} onPageChange={(page) => update({ page })} controls={viewSwitch} />
    </div>
    {/* Phones and tablets have two views, so one button to the other view, on the right where it does not cover a card's price. */}
    <button type="button" onClick={() => update({ view: state.view === "map" ? "list" : "map", page: state.page, selected: state.selected })} className="fixed bottom-[82px] right-4 z-40 flex min-h-12 items-center gap-2 rounded-full bg-ink-block px-5 text-d-subhead font-semibold text-white shadow-menu active:scale-[0.97] md:bottom-6 lg:hidden">{state.view === "map" ? <><List className="size-4" aria-hidden="true" />列表</> : <><Map className="size-4" aria-hidden="true" />地图</>}</button>
    {/* Desktop: floating over the list in list view; with a map on screen it sits at the bottom of the map instead. */}
    {state.view === "list" ? <div className="fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 lg:block">{viewSwitch}</div> : null}
    {notice ? <div role="status" className="fixed bottom-[144px] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-psw-md bg-toast-bg px-5 py-3 text-d-subhead text-on-toast shadow-menu md:bottom-24"><Check className="size-4 text-toast-success" aria-hidden="true" />{notice}<Link href="/saved" className="ml-2 flex min-h-6 items-center font-semibold text-toast-action underline">查看</Link></div> : null}
    {filterOpen ? <SearchFiltersDialog initialSection={filterOpen} initial={state} prices={searchCatalog(listings, { ...state, ...emptyFilters, page: 1 }, Number.MAX_SAFE_INTEGER).items.map((listing) => listing.price)} getCount={(draft) => searchCatalog(listings, draft).total} onApply={(draft) => { update({ ...draft, page: 1, selected: "" }); setFilterOpen(null); }} onClose={() => setFilterOpen(null)} /> : null}
  </main>;
}
