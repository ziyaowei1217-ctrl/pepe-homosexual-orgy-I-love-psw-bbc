"use client";

import { ArrowRight, LocateFixed, MapPin, Minus, Plus, X, ChevronLeft, ChevronRight, GraduationCap } from "lucide-react";
import { SmartImage as Image } from "@/components/ui/smart-image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { defaultMapAttribution, getListingPoint, getMapCenterForListings, getMapMarkers, minMapZoom, maxMapZoom, type MapSize } from "@/lib/listing-map";
import { InteractiveMapSurface, type InteractiveMapSurfaceHandle, type MapSurfaceStatus, type MapViewport } from "./interactive-map-surface";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref, type ListingStay } from "@/lib/listing-stay";
import { clusterSearchMarkers } from "@/lib/search-map-clusters";
import { getCampusesByCities } from "@/lib/map-campus-landmarks";
import type { SearchView } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export function SearchResultsMap({ listings, activeListing, selectedListingId, stay, view, onSelect, onOpen, onClose, page, pageCount, onPageChange }: {
  listings: PreviewListing[]; activeListing?: PreviewListing; view: SearchView;
  selectedListingId?: string;
  stay?: Partial<ListingStay>;
  page: number; pageCount: number; onPageChange: (page: number) => void;
  onSelect: (id: string) => void; onOpen: (id: string) => void; onClose: () => void;
}) {
  const canvas = useRef<HTMLElement>(null);
  const [viewportTop, setViewportTop] = useState(205);
  const surface = useRef<InteractiveMapSurfaceHandle>(null);
  const manualView = useRef(false);
  const autoFitKey = useRef("");
  const revealedSelection = useRef("");
  const [status, setStatus] = useState<MapSurfaceStatus>("loading");
  const [retry, setRetry] = useState(0);
  const initialCity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const listing of listings) { const city = listing.area.split("·")[0].trim(); counts.set(city, (counts.get(city) ?? 0) + 1); }
    return counts.size > 1 ? [...counts].sort((a, b) => b[1] - a[1])[0][0] : "";
  }, [listings]);
  const [focusedCity, setFocusedCity] = useState(initialCity);
  const initialListings = useMemo(() => initialCity ? listings.filter((listing) => listing.area.split("·")[0].trim() === initialCity) : listings, [initialCity, listings]);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const clusterPanel = useRef<HTMLDivElement>(null);
  const previewPanel = useRef<HTMLDivElement>(null);
  const focusPreview = useRef(false);
  const [size, setSize] = useState<MapSize>({ width: 720, height: 640 });
  const fittedCenter = useMemo(() => getMapCenterForListings(initialListings), [initialListings]);
  const fittedZoom = useMemo(() => {
    for (let zoom = 12; zoom >= 2; zoom--) {
      const points = getMapMarkers(initialListings, fittedCenter, zoom, size, false);
      if (points.every((point) => point.x > 65 && point.x < size.width - 65 && point.y > (size.height < 300 ? 30 : 80) && point.y < size.height - (size.height < 300 ? 40 : 176))) return zoom;
    }
    return 2;
  }, [fittedCenter, initialListings, size]);
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const center = viewport?.center ?? fittedCenter;
  const zoom = viewport?.zoom ?? fittedZoom;
  const markers = getMapMarkers(listings, center, zoom, size, false);
  const visibleMarkers = markers.filter((marker) => marker.x > 0 && marker.x < size.width && marker.y > 0 && marker.y < size.height);
  // Keep the group's identity and neighbours accessible. Its selected home
  // supplies the price and geographic anchor without creating overlapping pins.
  const selectedMarker = visibleMarkers.find((marker) => marker.id === selectedListingId);
  const clusters = clusterSearchMarkers(visibleMarkers);
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const clusterListings = listings.filter((listing) => clusterIds.includes(listing.id));
  const attribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? defaultMapAttribution;
  const cities = useMemo(() => [...new Set(listings.map((listing) => listing.area.split("·")[0].trim()))].sort(), [listings]);
  const campuses = useMemo(() => getCampusesByCities(cities), [cities]);
  const campusMarkers = getMapMarkers(campuses.map((campus) => ({ id: campus.id, title: campus.label, area: campus.city, price: 0, latitude: campus.lat, longitude: campus.lng })), center, zoom, size, false)
    .filter((marker) => marker.x > 36 && marker.x < size.width - 36 && marker.y > 64 && marker.y < size.height - 64);
  const fitListings = useCallback((items: PreviewListing[]) => {
    const short = size.height < 300;
    surface.current?.fitBounds(items.map(getListingPoint), { topLeft: [60, short ? 20 : 76], bottomRight: [60, short ? 12 : 120] });
  }, [size]);
  const restoreFocus = () => {
    const trigger = lastTrigger.current;
    requestAnimationFrame(() => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); else canvas.current?.focus({ preventScroll: true }); });
  };
  const closeCluster = () => { setClusterIds([]); restoreFocus(); };
  const closePreview = () => { onClose(); restoreFocus(); };

  useEffect(() => {
    const key = `${size.width}:${size.height}:${retry}`;
    if (surface.current?.getViewport() && !manualView.current && view !== "list" && autoFitKey.current !== key) {
      autoFitKey.current = key;
      fitListings(focusedCity ? listings.filter((listing) => listing.area.split("·")[0].trim() === focusedCity) : listings);
    }
  }, [fitListings, listings, status, view, size, retry, viewport, focusedCity]);

  useEffect(() => {
    if (!selectedListingId) { revealedSelection.current = ""; return; }
    if (view === "list" || revealedSelection.current === selectedListingId) return;
    const listing = listings.find((item) => item.id === selectedListingId);
    const current = surface.current?.getViewport();
    if (!listing || !current) return;
    revealedSelection.current = selectedListingId;
    const frame = canvas.current?.getBoundingClientRect();
    const measuredSize = frame && frame.width > 0 && frame.height > 0 ? { width: frame.width, height: frame.height } : size;
    const marker = getMapMarkers([listing], current.center, current.zoom, measuredSize, false)[0];
    const preview = previewPanel.current?.getBoundingClientRect();
    const previewTop = frame && preview && preview.height > 0 ? preview.top - frame.top : measuredSize.height;
    const pin = canvas.current?.querySelector<HTMLElement>('[data-map-selected="true"]')?.getBoundingClientRect();
    const pinWidth = pin && pin.width > 0 && pin.width < measuredSize.width ? pin.width : 88;
    const pinHeight = pin && pin.height > 0 && pin.height < measuredSize.height ? pin.height : 44;
    const coveredByControl = frame && [...(canvas.current?.querySelectorAll<HTMLElement>(".search-map-zoom, .search-map-city, .search-map-campus-control, .search-map-pagination") ?? [])].some((control) => {
      const box = control.getBoundingClientRect();
      if (!box.width || !box.height || box.width >= measuredSize.width || box.height >= measuredSize.height) return false;
      return marker.x + pinWidth / 2 + 8 > box.left - frame.left && marker.x - pinWidth / 2 - 8 < box.right - frame.left &&
        marker.y + pinHeight / 2 + 8 > box.top - frame.top && marker.y - pinHeight / 2 - 8 < box.bottom - frame.top;
    });
    const topLimit = measuredSize.height < 300 ? 24 : 70;
    // Keep the full 44px selected pill above the actual card, including short
    // landscape canvases where a fixed bottom inset exceeds the map height.
    const bottomLimit = Math.max(24, Math.min(measuredSize.height - 24, previewTop - 26));
    const horizontalInset = Math.max(60, pinWidth / 2 + 8);
    if (marker.x < horizontalInset || marker.x > measuredSize.width - horizontalInset || marker.y < topLimit || marker.y > bottomLimit || coveredByControl) {
      manualView.current = true;
      surface.current?.setView({ center: getListingPoint(listing), zoom: Math.max(12, current.zoom) });
      const targetY = Math.min(measuredSize.height / 2, bottomLimit);
      if (targetY < measuredSize.height / 2) surface.current?.panBy([0, measuredSize.height / 2 - targetY]);
    }
  }, [selectedListingId, listings, size, view, status, viewport]);

  useEffect(() => {
    if (clusterIds.length) clusterPanel.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [clusterIds]);

  useEffect(() => {
    if (activeListing && !clusterIds.length && focusPreview.current) {
      focusPreview.current = false;
      previewPanel.current?.querySelector<HTMLAnchorElement>("a")?.focus({ preventScroll: true });
    }
  }, [activeListing, clusterIds]);

  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = canvas.current;
    if (!element || view !== "map") return;
    const toolbar = document.querySelector<HTMLElement>(".search-toolbar");
    const header = document.querySelector<HTMLElement>(".marketplace-shell > header");
    let frame = 0;
    const measure = () => {
      // Fit the canvas to its actual visible top, including the demo banner and
      // responsive toolbar. Sticky controls bound the inset while scrolling.
      const top = Math.max(0, element.getBoundingClientRect().top, toolbar?.getBoundingClientRect().bottom ?? 0);
      setViewportTop((current) => current === top ? current : top);
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    if (element.getBoundingClientRect().height > 0 && window.matchMedia?.("(max-width: 1023px)").matches) {
      const top = element.getBoundingClientRect().top + window.scrollY - (header?.offsetHeight ?? 73) - (toolbar?.offsetHeight ?? 0);
      window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
    }
    measure();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    if (toolbar) observer?.observe(toolbar);
    if (header) observer?.observe(header);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
      observer?.disconnect();
    };
  }, [view]);

  return <section ref={canvas} data-view={view} data-map-palette={process.env.NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE ? "original" : "calm"} data-map-zoom={zoom} data-map-lat={center.lat} data-map-lng={center.lng} data-map-ready={status === "ready"} style={{ "--search-map-top": `${viewportTop}px` } as CSSProperties} aria-label="房源地图" aria-describedby="search-map-instructions" tabIndex={0} onKeyDown={(event) => {
    if (event.key === "Escape") {
      if (clusterListings.length) { event.preventDefault(); closeCluster(); }
      else if (activeListing) { event.preventDefault(); closePreview(); }
      return;
    }
    if (event.target !== event.currentTarget) return;
    const shift: Record<string, [number, number]> = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] };
    if (shift[event.key]) { event.preventDefault(); manualView.current = true; surface.current?.panBy(shift[event.key]); }
    else if (["+", "=", "-"].includes(event.key)) {
      event.preventDefault(); manualView.current = true;
      surface.current?.setView({ center, zoom: Math.max(minMapZoom, Math.min(maxMapZoom, zoom + (event.key === "-" ? -1 : 1))) });
    }
  }} className={cn("search-map relative isolate min-h-[calc(100dvh-205px)] overflow-hidden border-l border-slate-200 bg-[#e4e8f2] lg:sticky lg:top-[153px] lg:h-[calc(100dvh-153px)] lg:min-h-0", view === "list" && "hidden", view === "split" && "hidden lg:block")} onPointerDown={(event) => {
    if (!(event.target as HTMLElement).closest("button, a, [data-map-controls]")) manualView.current = true;
  }} onWheelCapture={(event) => {
    if (!(event.target as HTMLElement).closest("[data-map-controls]")) manualView.current = true;
  }}>
    <InteractiveMapSurface key={retry} ref={surface} initialViewport={{ center, zoom }} enabled={view !== "list"} onViewportChange={setViewport} onStatusChange={setStatus} />
    {zoom >= 10 ? <div className="search-map-campuses pointer-events-none absolute inset-0 z-[5]" aria-hidden="true">{campusMarkers.map((campus) => <div key={campus.id} data-map-campus={campus.id} style={{ left: campus.x, top: campus.y }} className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/90 bg-[#eef2ff]/95 px-2 py-1 text-[10px] font-semibold text-[#4338ca] shadow-sm"><GraduationCap className="size-3.5" /><span>{campus.title}</span></div>)}</div> : null}
    <p id="search-map-instructions" className="sr-only">拖动、滚轮或双指缩放地图。键盘方向键移动，加减键缩放。房源位置为社区示意，月租和租期以详情为准。</p>
    <div className="search-map-count pointer-events-none absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/80 bg-white/95 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-md"><MapPin className="size-3.5 text-[#2453ff]" />视野内 {visibleMarkers.length} / 本页 {listings.length}<span className="text-slate-300">|</span><span className="font-normal text-slate-500">月租 · 位置示意</span></div>
    {cities.length > 1 ? <label data-map-controls className="search-map-city absolute left-4 top-[76px] z-30 flex max-w-[calc(100%-88px)] items-center gap-2 rounded-xl border border-slate-200 bg-white pl-3 shadow-md"><span className="shrink-0 text-xs font-semibold text-slate-500">聚焦城市</span><select aria-label="聚焦地图城市" value={focusedCity} onChange={(event) => { const city = event.target.value; setFocusedCity(city); setClusterIds([]); manualView.current = true; fitListings(city ? listings.filter((listing) => listing.area.split("·")[0].trim() === city) : listings); }} className="min-h-11 min-w-0 max-w-40 rounded-xl bg-white pr-3 text-xs font-semibold"><option value="">本页全部</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label> : null}
    {campuses.length ? <label data-map-controls style={{ top: cities.length > 1 ? 132 : 76 }} className="search-map-campus-control absolute left-4 z-30 flex max-w-[calc(100%-88px)] items-center gap-2 rounded-xl border border-white bg-white/95 pl-3 shadow-md"><GraduationCap className="size-4 shrink-0 text-[#2453ff]" /><select aria-label="定位校园参照点" title="公共校园参照点，不代表房源地址或通勤时间" value="" onChange={(event) => {
      const campus = campuses.find((item) => item.id === event.target.value);
      if (!campus) return;
      manualView.current = true; setFocusedCity(campus.city); setClusterIds([]);
      surface.current?.setView({ center: { lat: campus.lat, lng: campus.lng }, zoom: 14 });
    }} className="min-h-11 min-w-0 max-w-40 rounded-xl bg-transparent pr-3 text-xs font-semibold text-[#2453ff]"><option value="">校园参照</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.label}</option>)}</select></label> : null}
    {status === "loading" ? <span role="status" className="search-map-status pointer-events-none absolute bottom-4 left-3 z-20 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-500">底图加载中…</span> : null}
    {status === "error" ? <div data-map-controls role="status" className="search-map-error absolute left-1/2 top-1/2 z-30 w-[min(280px,calc(100%-96px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-lg"><p className="text-sm font-semibold">底图暂时无法加载</p><p className="mt-1 text-xs leading-5 text-slate-500">可以继续查看房源，或重新加载地图。</p><button type="button" onClick={() => { setStatus("loading"); setRetry((value) => value + 1); }} className="mt-3 min-h-11 rounded-xl bg-brand px-4 text-xs font-semibold text-white">重新加载底图</button></div> : null}
    {view === "map" && pageCount > 1 ? <nav aria-label="地图房源分页" style={{ top: (cities.length > 1 ? 132 : 82) + (campuses.length ? 56 : 0) }} className="search-map-pagination absolute left-4 z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-md"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="地图上一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronLeft className="size-4" /></button><span className="text-xs font-semibold">{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="地图下一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronRight className="size-4" /></button></nav> : null}
    {clusters.map((cluster) => {
      const selection = selectedMarker && cluster.items.some((item) => item.id === selectedMarker.id) ? selectedMarker : undefined;
      const marker = selection ?? cluster.items[0];
      const active = cluster.items.some((item) => item.id === activeListing?.id);
      return <button key={cluster.items.map((item) => item.id).sort().join(",")} type="button" data-map-selected={Boolean(selection)} aria-label={cluster.items.length > 1 ? `查看此区域 ${cluster.items.length} 套房源` : `选择 ${marker.title ?? marker.area} ${marker.label}`} aria-pressed={active} onClick={(event) => { lastTrigger.current = event.currentTarget; if (cluster.items.length > 1) setClusterIds(cluster.items.map((item) => item.id)); else { setClusterIds([]); onSelect(marker.id); } }} style={{ left: selection?.x ?? cluster.x, top: selection?.y ?? cluster.y, zIndex: active ? 30 : 10 }} className={cn("search-map-price font-display absolute -translate-x-1/2 -translate-y-1/2 min-h-11 whitespace-nowrap rounded-full border-2 border-white px-3.5 py-2 text-[13px] font-bold shadow-[0_8px_20px_rgba(11,16,38,0.25)] transition-[color,background-color,transform] hover:scale-110", active ? "scale-110 bg-[#2453ff] text-white" : "bg-[#0b1026] text-white")}>
        <span className="flex items-center gap-1.5">{cluster.items.length > 1 ? <span className="grid size-5 place-items-center rounded-full bg-white text-[10px] text-[#0b1026]">{cluster.items.length}</span> : null}{cluster.items.length > 1 && !selection ? "套房源" : <span>{marker.label}<span className="ml-0.5 font-normal opacity-70">/月</span></span>}</span>
      </button>;
    })}
    <div className="search-map-zoom absolute right-4 top-[82px] z-30 flex flex-col gap-3">
      <button type="button" aria-label="显示本页全部房源" title="显示本页全部房源" onClick={() => { manualView.current = false; setFocusedCity(""); setClusterIds([]); fitListings(listings); }} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white shadow-md"><LocateFixed className="size-5" /></button>
      <div className="search-map-zoom-steps overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"><button type="button" aria-label="放大地图" disabled={zoom >= maxMapZoom} onClick={() => { manualView.current = true; surface.current?.setView({ center, zoom: Math.min(maxMapZoom, Math.floor(zoom) + 1) }); }} className="grid size-11 place-items-center border-b border-slate-200 hover:bg-slate-50 disabled:opacity-30"><Plus className="size-4" /></button><button type="button" aria-label="缩小地图" disabled={zoom <= minMapZoom} onClick={() => { manualView.current = true; surface.current?.setView({ center, zoom: Math.max(minMapZoom, Math.ceil(zoom) - 1) }); }} className="grid size-11 place-items-center hover:bg-slate-50 disabled:opacity-30"><Minus className="size-4" /></button></div>
    </div>
    {!listings.length ? <div className="absolute inset-0 grid place-items-center bg-slate-100/80 px-6 text-center text-sm text-slate-600">当前条件下没有房源，调整筛选后再看看。</div> : null}
    {clusterListings.length ? <div ref={clusterPanel} data-map-controls className="search-map-cluster fixed inset-x-4 bottom-[144px] z-40 touch-auto mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-white p-4 shadow-2xl md:bottom-24 lg:absolute lg:bottom-[136px]">
      <div className="search-map-cluster-header mb-3 flex shrink-0 items-center justify-between"><h2 className="text-sm font-bold">此区域的 {clusterListings.length} 套房源</h2><button type="button" aria-label="关闭区域房源" onClick={closeCluster} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-slate-100"><X className="size-4" /></button></div>
      <div className="search-map-cluster-list max-h-52 space-y-1 overflow-y-auto">{clusterListings.map((listing) => <button type="button" key={listing.id} onClick={() => { focusPreview.current = true; setClusterIds([]); onSelect(listing.id); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left text-xs hover:bg-brand-soft"><div className="min-w-0"><span className="block truncate font-semibold">{listing.title}</span><span className="search-map-cluster-detail mt-1 block truncate text-[11px] text-slate-500">{listing.area.split("·").at(1)?.trim() ?? listing.area} · {listing.availableFrom.slice(5)} — {listing.availableTo.slice(5)}</span></div><strong className="shrink-0 text-[#2453ff]">${listing.price.toLocaleString("en-US")}/月</strong></button>)}</div>
      <button type="button" aria-label="放大这一区域" onClick={() => { manualView.current = true; fitListings(clusterListings); closeCluster(); }} className="search-map-cluster-fit mt-3 min-h-11 w-full rounded-xl bg-slate-950 py-2.5 text-xs font-semibold text-white"><Plus className="hidden size-4" aria-hidden="true" /><span>放大这一区域</span></button>
    </div> : null}
    {activeListing && !clusterListings.length ? <div ref={previewPanel} data-map-controls className="search-map-preview fixed inset-x-4 bottom-[144px] z-30 touch-auto mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-white shadow-[0_12px_48px_rgba(15,23,42,0.2)] md:bottom-24 lg:absolute lg:bottom-[136px]">
      <button type="button" aria-label="关闭地图房源预览" onClick={closePreview} className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-white/95 shadow-sm"><X className="size-3.5" /></button>
      <Link href={listingHref(activeListing.id, stay)} onClick={() => onOpen(activeListing.id)} className="flex gap-3 p-3">
        <div className="search-map-preview-image relative min-h-[132px] w-[84px] shrink-0 overflow-hidden rounded-xl sm:w-[104px]"><Image src={activeListing.image} alt="" fill sizes="(max-width: 639px) 84px, 104px" className="object-cover" /></div>
        <div className="search-map-preview-text min-w-0 flex-1 py-1"><p className="font-display pr-10 text-lg font-bold text-[#0b1026]">${activeListing.price.toLocaleString("en-US")} <span className="text-xs font-normal text-slate-500">/ 月</span></p><p className="mt-1 line-clamp-2 text-sm font-semibold leading-5">{activeListing.title}</p><p className="mt-1 text-xs leading-4 text-slate-500">{activeListing.area}</p><p className="search-map-preview-lease mt-1 text-[11px] leading-4 text-slate-500">租期 {activeListing.availableFrom} — {activeListing.availableTo}</p><span className="mt-2 flex items-center gap-1 text-xs font-semibold text-[#2453ff]">查看房源 <ArrowRight className="size-3" /></span></div>
      </Link>
    </div> : <p className="search-map-hint pointer-events-none fixed bottom-[144px] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-xs text-slate-600 shadow-sm md:bottom-24 lg:absolute">拖动与缩放 · 点击月租查看转租房源</p>}
    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="search-map-attribution absolute right-2 top-0 z-20 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600">{attribution}</a>
  </section>;
}
