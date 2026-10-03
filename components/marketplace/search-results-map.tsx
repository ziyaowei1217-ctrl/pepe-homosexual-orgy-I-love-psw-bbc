"use client";

import { ArrowRight, LocateFixed, MapPin, Minus, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "@/components/ui/app-image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

import { defaultMapAttribution, getMapCenterForListings, getMapMarkers, getMapTiles, panMapCenter, type MapPoint, type MapSize } from "@/lib/listing-map";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref, type ListingStay } from "@/lib/listing-stay";
import { clusterSearchMarkers } from "@/lib/search-map-clusters";
import type { SearchView } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export function SearchResultsMap({ listings, activeListing, stay, view, onSelect, onOpen, onClose, page, pageCount, onPageChange }: {
  listings: PreviewListing[]; activeListing?: PreviewListing; view: SearchView;
  stay?: Partial<ListingStay>;
  page: number; pageCount: number; onPageChange: (page: number) => void;
  onSelect: (id: string) => void; onOpen: (id: string) => void; onClose: () => void;
}) {
  const canvas = useRef<HTMLElement>(null);
  const [viewportTop, setViewportTop] = useState(205);
  const drag = useRef<{ x: number; y: number; center: MapPoint } | null>(null);
  const [size, setSize] = useState<MapSize>({ width: 720, height: 640 });
  const fittedCenter = useMemo(() => getMapCenterForListings(listings), [listings]);
  const fittedZoom = useMemo(() => {
    for (let zoom = 12; zoom >= 2; zoom--) {
      const points = getMapMarkers(listings, fittedCenter, zoom, size, false);
      if (points.every((point) => point.x > 65 && point.x < size.width - 65 && point.y > (size.height < 300 ? 30 : 80) && point.y < size.height - (size.height < 300 ? 40 : 176))) return zoom;
    }
    return 2;
  }, [fittedCenter, listings, size]);
  const [viewport, setViewport] = useState<{ center: MapPoint; zoom: number } | null>(null);
  const center = viewport?.center ?? fittedCenter;
  const zoom = viewport?.zoom ?? fittedZoom;
  const tiles = getMapTiles(center, zoom, size);
  const markers = getMapMarkers(listings, center, zoom, size, false);
  const clusters = clusterSearchMarkers(markers.filter((marker) => marker.x > 0 && marker.x < size.width && marker.y > 0 && marker.y < size.height));
  const [clusterIds, setClusterIds] = useState<string[]>([]);
  const clusterListings = listings.filter((listing) => clusterIds.includes(listing.id));
  const attribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? defaultMapAttribution;

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

  return <section ref={canvas} data-view={view} style={{ "--search-map-top": `${viewportTop}px` } as CSSProperties} aria-label="房源地图" tabIndex={0} onKeyDown={(event) => {
    if (event.target !== event.currentTarget) return;
    const shift = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
    if (shift) { event.preventDefault(); setViewport({ center: panMapCenter(center, zoom, shift[0], shift[1]), zoom }); }
  }} className={cn("search-map relative min-h-[calc(100dvh-205px)] touch-none overflow-hidden border-l border-slate-200 bg-[#e8ede8] lg:sticky lg:top-[153px] lg:h-[calc(100dvh-153px)] lg:min-h-0", view === "list" && "hidden", view === "split" && "hidden lg:block")} onPointerDown={(event) => {
    if ((event.target as HTMLElement).closest("button, a, [data-map-controls]") || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={(event) => {
    if (!drag.current) return;
    setViewport({ center: panMapCenter(drag.current.center, zoom, event.clientX - drag.current.x, event.clientY - drag.current.y), zoom });
  }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div className="absolute inset-0 cursor-grab opacity-85 saturate-[0.65] active:cursor-grabbing" aria-hidden="true">{tiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}</div>
    <div className="search-map-count pointer-events-none absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/80 bg-white/95 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-md"><MapPin className="size-3.5 text-[#234B3B]" />{listings.length} 个地图结果<span className="text-slate-300">|</span><span className="font-normal text-slate-500">本页房源</span></div>
    {view === "map" && pageCount > 1 ? <nav aria-label="地图房源分页" className="search-map-pagination absolute left-4 top-[82px] z-30 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-1 shadow-md"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="地图上一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronLeft className="size-4" /></button><span className="text-xs font-semibold">{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="地图下一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronRight className="size-4" /></button></nav> : null}
    {clusters.map((cluster) => {
      const marker = cluster.items[0];
      const active = cluster.items.some((item) => item.id === activeListing?.id);
      return <button key={cluster.items.map((item) => item.id).join(",")} type="button" aria-label={cluster.items.length > 1 ? `查看此区域 ${cluster.items.length} 套房源` : `选择 ${marker.title ?? marker.area} ${marker.label}`} aria-pressed={active} onClick={() => { if (cluster.items.length > 1) setClusterIds(cluster.items.map((item) => item.id)); else { setClusterIds([]); onSelect(marker.id); } }} style={{ left: cluster.x, top: cluster.y, zIndex: active ? 30 : 10 }} className={cn("absolute -translate-x-1/2 -translate-y-1/2 min-h-11 whitespace-nowrap rounded-full border px-3 py-2 text-xs font-bold shadow-md transition-[color,background-color,transform] hover:scale-110", active ? "scale-110 border-slate-950 bg-slate-950 text-white" : "border-white bg-white text-slate-950")}>{cluster.items.length > 1 ? <span className="flex items-center gap-1.5"><span className="grid size-4 place-items-center rounded-full bg-blue-50 text-[10px] text-[#234B3B]">{cluster.items.length}</span>套房源</span> : marker.label}</button>;
    })}
    <div className="search-map-zoom absolute right-4 top-[82px] z-30 flex flex-col gap-3">
      <button type="button" aria-label="显示本页全部房源" title="显示本页全部房源" onClick={() => setViewport(null)} className="grid size-11 place-items-center rounded-xl border border-slate-200 bg-white shadow-md"><LocateFixed className="size-5" /></button>
      <div className="search-map-zoom-steps overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md"><button type="button" aria-label="放大地图" disabled={zoom >= 16} onClick={() => setViewport({ center, zoom: Math.min(16, zoom + 1) })} className="grid size-11 place-items-center border-b border-slate-200 hover:bg-slate-50 disabled:opacity-30"><Plus className="size-4" /></button><button type="button" aria-label="缩小地图" disabled={zoom <= 2} onClick={() => setViewport({ center, zoom: Math.max(2, zoom - 1) })} className="grid size-11 place-items-center hover:bg-slate-50 disabled:opacity-30"><Minus className="size-4" /></button></div>
    </div>
    {!listings.length ? <div className="absolute inset-0 grid place-items-center bg-slate-100/80 px-6 text-center text-sm text-slate-600">当前条件下没有房源，调整筛选后再看看。</div> : null}
    {clusterListings.length ? <div data-map-controls className="search-map-cluster fixed inset-x-4 bottom-[144px] z-40 touch-auto mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-white p-4 shadow-2xl md:bottom-24 lg:absolute lg:bottom-[136px]">
      <div className="search-map-cluster-header mb-3 flex shrink-0 items-center justify-between"><h2 className="text-sm font-bold">此区域的 {clusterListings.length} 套房源</h2><button type="button" aria-label="关闭区域房源" onClick={() => setClusterIds([])} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-slate-100"><X className="size-4" /></button></div>
      <div className="search-map-cluster-list max-h-52 space-y-1 overflow-y-auto">{clusterListings.map((listing) => <button type="button" key={listing.id} onClick={() => { setClusterIds([]); onSelect(listing.id); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-2 py-3 text-left text-xs hover:bg-blue-50"><span className="truncate">{listing.title}</span><strong className="shrink-0">${listing.price.toLocaleString()}/月</strong></button>)}</div>
      <button type="button" aria-label="放大这一区域" onClick={() => { setViewport({ center: getMapCenterForListings(clusterListings), zoom: Math.min(16, zoom + 2) }); setClusterIds([]); }} className="search-map-cluster-fit mt-3 min-h-11 w-full rounded-xl bg-slate-950 py-2.5 text-xs font-semibold text-white"><Plus className="hidden size-4" aria-hidden="true" /><span>放大这一区域</span></button>
    </div> : null}
    {activeListing && !clusterListings.length ? <div data-map-controls className="search-map-preview fixed inset-x-4 bottom-[144px] z-30 touch-auto mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-white shadow-[0_12px_48px_rgba(15,23,42,0.2)] md:bottom-24 lg:absolute lg:bottom-[136px]">
      <button type="button" aria-label="关闭地图房源预览" onClick={onClose} className="absolute right-2 top-2 z-10 grid size-11 place-items-center rounded-full bg-white/95 shadow-sm"><X className="size-3.5" /></button>
      <Link href={listingHref(activeListing.id, stay)} onClick={() => onOpen(activeListing.id)} className="flex gap-3 p-3">
        <div className="search-map-preview-image relative h-[104px] w-[112px] shrink-0 overflow-hidden rounded-xl"><Image src={activeListing.image} alt="" fill sizes="112px" className="object-cover" /></div>
        <div className="search-map-preview-text min-w-0 py-1 pr-11"><p className="text-lg font-bold">${activeListing.price.toLocaleString()} <span className="text-xs font-normal text-slate-500">/ 月</span></p><p className="mt-1 truncate text-sm font-semibold">{activeListing.title}</p><p className="mt-1 truncate text-xs text-slate-500">{activeListing.area}</p><span className="mt-3 flex items-center gap-1 text-xs font-semibold text-[#234B3B]">查看房源 <ArrowRight className="size-3" /></span></div>
      </Link>
    </div> : <p className="search-map-hint pointer-events-none fixed bottom-[144px] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/95 px-4 py-2 text-xs text-slate-600 shadow-sm md:bottom-24 lg:absolute">拖动地图探索 · 点击价格查看房源</p>}
    <span className="search-map-attribution pointer-events-none absolute right-2 top-0 z-50 rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-slate-600">{attribution}</span>
  </section>;
}
