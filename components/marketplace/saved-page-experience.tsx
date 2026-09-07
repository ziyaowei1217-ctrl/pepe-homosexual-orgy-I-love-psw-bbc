"use client";

import {
  FolderHeart,
  Heart,
  Info,
  List,
  Map,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Star,
  X
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { defaultMapAttribution, getMapCenterForListings, getMapMarkers, getMapTiles } from "@/lib/listing-map";
import { DEFAULT_SAVED_COLLECTION_ID } from "@/lib/saved-collections";
import type { PreviewListing } from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export function SavedPageExperience({ listings }: { listings: PreviewListing[] }) {
  const { state, savedIds, accountLabel, createCollection, toggleSaved, toggleInCollection, setNote } = useSavedListings();
  const [activeCollectionId, setActiveCollectionId] = useState(DEFAULT_SAVED_COLLECTION_ID);
  const [mapView, setMapView] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [sort, setSort] = useState<"recent" | "price-low" | "price-high">("recent");
  const activeCollection = state.collections.find((collection) => collection.id === activeCollectionId) ?? state.collections[0];
  const savedListings = useMemo(() => {
    const activeIds = activeCollectionId === DEFAULT_SAVED_COLLECTION_ID
      ? savedIds
      : new Set(activeCollection?.listingIds ?? []);
    const items = listings.filter((listing) => activeIds.has(listing.id));
    if (sort === "price-low") return [...items].sort((left, right) => left.price - right.price);
    if (sort === "price-high") return [...items].sort((left, right) => right.price - left.price);
    return items;
  }, [activeCollection?.listingIds, activeCollectionId, listings, savedIds, sort]);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCollectionName.trim();
    if (!name) return;
    createCollection(name);
    setNewCollectionName("");
    setCreateOpen(false);
  }

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1520px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8 lg:py-14">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:flex sm:items-end sm:justify-between sm:gap-6">
            <div className="contents sm:block">
              <div className="hidden items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#0668e1] sm:flex"><FolderHeart className="size-4" />你的空间</div>
              <h1 className="col-start-1 row-start-1 text-3xl font-black tracking-[-0.055em] text-slate-950 sm:mt-3 sm:text-6xl">收藏清单</h1>
              <p className="col-span-2 row-start-2 max-w-2xl text-sm leading-6 text-slate-500 sm:mt-4 sm:text-base">把喜欢的房放在一起比较。清单、备注与排序都只保存在当前设备。</p>
              <div className="col-span-2 row-start-3 inline-flex w-fit items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 sm:mt-4"><Info className="size-3.5 shrink-0" />{accountLabel}，暂不跨设备同步</div>
            </div>
            <button type="button" onClick={() => setCreateOpen(true)} className="col-start-2 row-start-1 flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5 sm:gap-2 sm:px-5 sm:py-3"><Plus className="size-4" />新建清单</button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1520px] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none]" aria-label="收藏分组">
          {state.collections.map((collection) => {
            const count = collection.id === DEFAULT_SAVED_COLLECTION_ID ? savedIds.size : collection.listingIds.length;
            return (
              <button key={collection.id} type="button" onClick={() => setActiveCollectionId(collection.id)} className={cn("shrink-0 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors", activeCollectionId === collection.id ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                {collection.name} <span className={cn("ml-1", activeCollectionId === collection.id ? "text-slate-300" : "text-slate-400")}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-b border-slate-200 pb-4 sm:mt-7 sm:gap-4 sm:pb-5">
          <div className="min-w-0"><h2 className="truncate text-base font-black tracking-[-0.025em] sm:text-xl">{activeCollection?.name ?? "全部收藏"}</h2><p className="mt-1 text-xs text-slate-500">{savedListings.length} 套房源</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500"><span className="hidden sm:inline">排序 </span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="bg-transparent text-slate-800 outline-none sm:ml-1" aria-label="收藏排序"><option value="recent">最近收藏</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option></select></label>
            <button type="button" onClick={() => setMapView((current) => !current)} aria-pressed={mapView} className={cn("flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold", mapView ? "border-[#0668e1] bg-blue-50 text-[#0668e1]" : "border-slate-200 bg-white text-slate-700")}>{mapView ? <List className="size-4" /> : <Map className="size-4" />}{mapView ? "列表" : "地图"}</button>
          </div>
        </div>

        {savedListings.length ? (
          <div className={cn("mt-5 grid gap-6 sm:mt-7", mapView ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]" : "")}>
            <div className={cn("gap-6 sm:grid-cols-2", mapView ? "hidden lg:grid" : "grid lg:grid-cols-3 xl:grid-cols-4")}>
              {savedListings.map((listing) => (
                <article key={listing.id} className="group overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <Link href={`/listing/${encodeURIComponent(listing.id)}`} className="relative block aspect-[4/3] overflow-hidden bg-slate-200">
                    <Image src={listing.image} alt={listing.title} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" />
                    <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1.5 text-[11px] font-black text-emerald-700 shadow-sm"><ShieldCheck className="mr-1 inline size-3.5" />信任信息</span>
                  </Link>
                  <div className="relative p-4">
                    <button type="button" onClick={() => toggleSaved(listing.id)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border border-slate-200 bg-white text-[#0668e1]" aria-label={`取消收藏 ${listing.title}`}><Heart className="size-4 fill-current" /></button>
                    <Link href={`/listing/${encodeURIComponent(listing.id)}`} className="block pr-10"><h3 className="line-clamp-2 text-base font-black leading-snug text-slate-950 group-hover:text-[#0668e1]">{listing.title}</h3><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="size-3.5" />{listing.area}</p></Link>
                    <div className="mt-3 flex items-end justify-between"><p className="text-lg font-black">${listing.price.toLocaleString()} <span className="text-xs font-medium text-slate-400">/ 月</span></p><span className="flex items-center gap-1 text-xs font-bold"><Star className="size-3.5 fill-amber-400 text-amber-400" />{listing.score}</span></div>
                    <textarea defaultValue={state.notes[listing.id] ?? ""} onBlur={(event) => setNote(listing.id, event.target.value)} aria-label={`${listing.title} 的收藏备注`} placeholder="添加仅自己可见的备注…" className="mt-4 min-h-16 w-full resize-none rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 outline-none focus:border-blue-300 focus:bg-white" />
                    {state.collections.length > 1 ? <label className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">加入清单<select aria-label={`${listing.title} 所属清单`} className="max-w-[150px] rounded-full border border-slate-200 bg-white px-2 py-1.5 text-slate-700" value="" onChange={(event) => { if (event.target.value) toggleInCollection(listing.id, event.target.value); }}><option value="">选择清单</option>{state.collections.filter((collection) => collection.id !== DEFAULT_SAVED_COLLECTION_ID).map((collection) => <option key={collection.id} value={collection.id}>{collection.listingIds.includes(listing.id) ? "✓ " : ""}{collection.name}</option>)}</select></label> : null}
                  </div>
                </article>
              ))}
            </div>
            {mapView ? <SavedMap listings={savedListings} /> : null}
          </div>
        ) : (
          <section className="mt-8 grid min-h-[440px] place-items-center rounded-[30px] border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <div>
              <span className="mx-auto grid size-16 place-items-center rounded-full bg-blue-50 text-[#0668e1]"><Heart className="size-7" /></span>
              <h2 className="mt-5 text-2xl font-black tracking-[-0.035em]">还没有收藏房源</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">浏览房源时点击爱心，这里就会成为一个干净、好比较的收藏空间。</p>
              <Link href="/search" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#0668e1] px-5 py-3 text-sm font-black text-white"><Search className="size-4" />去找房</Link>
            </div>
          </section>
        )}
      </div>

      {createOpen ? (
        <NewCollectionDialog name={newCollectionName} onNameChange={setNewCollectionName} onSubmit={handleCreate} onClose={() => setCreateOpen(false)} />
      ) : null}
    </main>
  );
}

function NewCollectionDialog({ name, onNameChange, onSubmit, onClose }: {
  name: string;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useModalFocus(dialog, onClose);

  return (
    <div className="marketplace-modal-backdrop fixed inset-0 z-[80] grid place-items-center bg-slate-950/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => onClose()}>
      <form ref={dialog} onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="marketplace-modal-panel max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-list-title">
        <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#0668e1]">整理收藏</p><h2 id="create-list-title" className="mt-1 text-2xl font-black">新建清单</h2></div><button type="button" onClick={onClose} className="grid size-10 place-items-center rounded-full border border-slate-200" aria-label="关闭"><X className="size-4" /></button></div>
        <label className="mt-6 block text-sm font-black">清单名称<input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="例如：九月入住" className="mt-2 h-12 w-full rounded-[16px] border border-slate-200 px-4 text-sm outline-none focus:border-blue-400" /></label>
        <button type="submit" className="mt-6 w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">创建清单</button>
      </form>
    </div>
  );
}

export function SavedMap({ listings }: { listings: PreviewListing[] }) {
  const canvas = useRef<HTMLElement>(null);
  const [mapSize, setMapSize] = useState({ width: 720, height: 620 });
  const center = getMapCenterForListings(listings);
  const tiles = getMapTiles(center, 11, mapSize);
  const markers = getMapMarkers(listings, center, 11, mapSize);
  const attribution = process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? defaultMapAttribution;

  useEffect(() => {
    if (!canvas.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width && entry.contentRect.height) {
        setMapSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);

  return (
    <aside ref={canvas} className="relative h-[60dvh] min-h-[360px] overflow-hidden rounded-[24px] bg-[#dce9e7] sm:rounded-[28px] lg:sticky lg:top-[96px] lg:h-[calc(100dvh-120px)] lg:min-h-[620px]" aria-label="收藏房源地图">
      <div className="absolute inset-0" aria-hidden="true">
        {tiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}
      </div>
      {markers.map((marker) => <Link key={marker.id} href={`/listing/${encodeURIComponent(marker.id)}`} style={{ left: marker.x, top: marker.y }} className="absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl">{marker.label}</Link>)}
      <div className="absolute left-4 top-4 z-30 rounded-full bg-white/94 px-4 py-2 text-xs font-black shadow-lg">{listings.length} 个收藏位置</div>
      <span className="absolute bottom-2 right-3 z-30 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{attribution}</span>
    </aside>
  );
}
