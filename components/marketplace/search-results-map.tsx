"use client";

import { ArrowRight, LocateFixed, MapPin, Minus, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { defaultMapAttribution, getMapCenterForListings, getMapMarkers, getMapTiles, panMapCenter, type MapPoint, type MapSize } from "@/lib/listing-map";
import type { PreviewListing } from "@/lib/preview-data";
import { listingHref, type ListingStay } from "@/lib/listing-stay";
import { clusterSearchMarkers } from "@/lib/search-map-clusters";
import type { SearchView } from "@/lib/search-state";
import { formatUsd, stayPrice } from "@/lib/stay-price";
import { cn } from "@/lib/utils";

export function SearchResultsMap({ listings, total = listings.length, activeListing, stay, view, onSelect, onOpen, onClose, page, pageCount, onPageChange }: {
  listings: PreviewListing[]; total?: number; activeListing?: PreviewListing; view: SearchView;
  stay?: Partial<ListingStay>;
  page: number; pageCount: number; onPageChange: (page: number) => void;
  onSelect: (id: string) => void; onOpen: (id: string) => void; onClose: () => void;
}) {
  const canvas = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; center: MapPoint } | null>(null);
  const [size, setSize] = useState<MapSize>({ width: 720, height: 640 });
  const fittedCenter = useMemo(() => getMapCenterForListings(listings), [listings]);
  const fittedZoom = useMemo(() => {
    for (let zoom = 12; zoom >= 2; zoom--) {
      const points = getMapMarkers(listings, fittedCenter, zoom, size, false);
      if (points.every((point) => point.x > 65 && point.x < size.width - 65 && point.y > 80 && point.y < size.height - 140)) return zoom;
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
  // psw: pins show the same number as the cards: the total for the chosen dates, else the monthly rent.
  const stayTotal = (listing: PreviewListing) => (stay?.moveIn && stay?.moveOut ? stayPrice(listing.price, stay.moveIn, stay.moveOut) : null);
  const pinLabel = (id: string, fallback: string) => {
    const listing = listings.find((item) => item.id === id);
    const total = listing ? stayTotal(listing) : null;
    return total ? formatUsd(total.total) : fallback;
  };

  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  return <section ref={canvas} aria-label="房源地图" tabIndex={0} onKeyDown={(event) => {
    if (event.target !== event.currentTarget) return;
    const shift = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[event.key];
    if (shift) { event.preventDefault(); setViewport({ center: panMapCenter(center, zoom, shift[0], shift[1]), zoom }); }
  }} className={cn("search-map relative min-h-[calc(100dvh-112px)] touch-none overflow-hidden border-l border-line-strong bg-line-strong lg:sticky lg:top-[153px] lg:h-[calc(100dvh-153px)] lg:min-h-0", view === "list" && "hidden", view === "split" && "hidden lg:block")} onPointerDown={(event) => {
    if ((event.target as HTMLElement).closest("button, a") || event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, center };
    event.currentTarget.setPointerCapture(event.pointerId);
  }} onPointerMove={(event) => {
    if (!drag.current) return;
    setViewport({ center: panMapCenter(drag.current.center, zoom, event.clientX - drag.current.x, event.clientY - drag.current.y), zoom });
  }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
    <div className="map-tiles absolute inset-0 cursor-grab active:cursor-grabbing" aria-hidden="true">{tiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}</div>
    <div className="map-tint pointer-events-none absolute inset-0" aria-hidden="true" />
    <p className="absolute left-1/2 top-5 z-20 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full bg-surface px-4 py-2.5 text-m-footnote font-semibold text-ink shadow-menu"><MapPin className="size-3.5 text-primary-text" aria-hidden="true" />地图上是本页 {listings.length} 套{total > listings.length ? <span className="font-normal text-ink-secondary">共 {total} 套，翻页看其余</span> : null}</p>
    {view === "map" && pageCount > 1 ? <nav aria-label="地图房源分页" className="absolute left-4 top-[82px] z-30 flex items-center gap-2 rounded-xl border border-line-strong bg-surface p-1 shadow-md"><button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="地图上一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronLeft className="size-4" /></button><span className="text-m-footnote font-semibold">{page} / {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="地图下一页" className="grid size-11 place-items-center rounded-lg disabled:opacity-30"><ChevronRight className="size-4" /></button></nav> : null}
    {clusters.map((cluster) => {
      const marker = cluster.items[0];
      const active = cluster.items.some((item) => item.id === activeListing?.id);
      return <button key={cluster.items.map((item) => item.id).join(",")} type="button" aria-label={cluster.items.length > 1 ? `查看此区域 ${cluster.items.length} 套房源` : `选择 ${marker.title ?? marker.area} ${pinLabel(marker.id, marker.label)}`} aria-pressed={active} onClick={() => { if (cluster.items.length > 1) setClusterIds(cluster.items.map((item) => item.id)); else { setClusterIds([]); onSelect(marker.id); } }} style={{ left: cluster.x, top: cluster.y, zIndex: active ? 30 : 10 }} className={cn("font-display absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border-2 border-surface px-3.5 py-2 text-[13px] font-bold shadow-menu transition-[color,background-color,transform] hover:scale-110", active ? "scale-110 border-primary bg-primary text-white" : "bg-surface text-ink")}>{cluster.items.length > 1 ? <span className="flex items-center gap-1.5"><span className="grid size-5 place-items-center rounded-full bg-primary-soft text-[11px] text-primary-text">{cluster.items.length}</span>套房源</span> : pinLabel(marker.id, marker.label)}</button>;
    })}
    <div className="absolute right-4 top-[82px] z-30 flex flex-col gap-3">
      <button type="button" aria-label="显示本页全部房源" title="显示本页全部房源" onClick={() => setViewport(null)} className="grid size-11 place-items-center rounded-full bg-surface shadow-menu"><LocateFixed className="size-5" /></button>
      <div className="overflow-hidden rounded-full bg-surface shadow-menu"><button type="button" aria-label="放大地图" disabled={zoom >= 16} onClick={() => setViewport({ center, zoom: Math.min(16, zoom + 1) })} className="grid size-11 place-items-center border-b border-line-strong hover:bg-surface-subtle disabled:opacity-30"><Plus className="size-4" /></button><button type="button" aria-label="缩小地图" disabled={zoom <= 2} onClick={() => setViewport({ center, zoom: Math.max(2, zoom - 1) })} className="grid size-11 place-items-center hover:bg-surface-subtle disabled:opacity-30"><Minus className="size-4" /></button></div>
    </div>
    {!listings.length ? <div className="absolute inset-0 grid place-items-center bg-tag-neutral/80 px-6 text-center text-sm text-ink-secondary">当前条件下没有房源，调整筛选后再看看。</div> : null}
    {clusterListings.length ? <div className="absolute inset-x-4 bottom-[136px] z-40 mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-surface p-4 shadow-2xl md:bottom-24">
      <div className="mb-3 flex items-center justify-between"><h2 className="text-d-label">此区域的 {clusterListings.length} 套房源</h2><button type="button" aria-label="关闭区域房源" onClick={() => setClusterIds([])} className="tap-target grid size-8 place-items-center rounded-full hover:bg-surface-subtle"><X className="size-4" /></button></div>
      <div className="max-h-52 space-y-1 overflow-y-auto">{clusterListings.map((listing) => <button type="button" key={listing.id} onClick={() => { setClusterIds([]); onSelect(listing.id); }} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-psw-md px-2 py-2.5 text-left text-d-subhead hover:bg-surface-subtle"><span className="truncate">{listing.title}</span><strong className="shrink-0">{stayTotal(listing) ? `总价 ${formatUsd(stayTotal(listing)!.total)}` : `${formatUsd(listing.price)}/月`}</strong></button>)}</div>
      <button type="button" onClick={() => { setViewport({ center: getMapCenterForListings(clusterListings), zoom: Math.min(16, zoom + 2) }); setClusterIds([]); }} className="mt-3 min-h-11 w-full rounded-full bg-primary font-rounded text-sm font-bold text-on-primary hover:bg-primary-hover">放大这一区域</button>
    </div> : null}
    {activeListing && !clusterListings.length ? <div className="absolute inset-x-4 bottom-[136px] z-30 mx-auto max-w-[380px] overflow-hidden rounded-[20px] bg-surface shadow-[0_12px_48px_rgba(29,22,64,0.2)] md:bottom-24">
      <button type="button" aria-label="关闭地图房源预览" onClick={onClose} className="tap-target absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-full bg-photo-button"><X className="size-4" /></button>
      <Link href={listingHref(activeListing.id, stay)} onClick={() => onOpen(activeListing.id)} className="flex gap-3 p-3">
        <div className="relative h-[104px] w-[112px] shrink-0 overflow-hidden rounded-xl"><SmartImage src={activeListing.image} alt="" fill sizes="112px" className="object-cover" /></div>
        <div className="min-w-0 py-1 pr-3"><p className="font-display text-lg font-extrabold text-primary-text">{stayTotal(activeListing) ? <>{formatUsd(stayTotal(activeListing)!.total)} <span className="font-sans text-m-footnote font-normal text-ink-secondary">总价 · 月租 {formatUsd(activeListing.price)}</span></> : <>{formatUsd(activeListing.price)} <span className="font-sans text-m-footnote font-normal text-ink-secondary">/ 月</span></>}</p><p className="mt-1 line-clamp-2 font-rounded text-d-label text-ink">{activeListing.title}</p><p className="mt-1 truncate text-m-footnote text-ink-secondary">{activeListing.area}</p><span className="mt-3 flex items-center gap-1 text-m-footnote font-semibold text-primary-text">查看房源 <ArrowRight className="size-3" /></span></div>
      </Link>
    </div> : <p className="absolute bottom-[144px] left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full bg-surface px-4 py-2 text-m-footnote text-ink-secondary shadow-menu md:bottom-24">拖动地图探索 · 点击价格查看房源</p>}
    <span className="absolute bottom-[72px] right-2 z-30 rounded bg-surface/90 px-1.5 py-0.5 text-[11px] text-ink-secondary md:bottom-2">{attribution}</span>
  </section>;
}
