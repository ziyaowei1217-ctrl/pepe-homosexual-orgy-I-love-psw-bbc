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
import { SmartImage as Image } from "@/components/ui/smart-image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { defaultMapAttribution, getMapCenterForListings, getMapMarkers, getMapTiles } from "@/lib/listing-map";
import { DEFAULT_SAVED_COLLECTION_ID, getSavedListingIds } from "@/lib/saved-collections";
import { clusterSearchMarkers } from "@/lib/search-map-clusters";
import type { PreviewListing } from "@/lib/preview-data";
import { cn } from "@/lib/utils";

export function SavedPageExperience({ listings }: { listings: PreviewListing[] }) {
  const { state, savedIds, accountLabel, createCollection, toggleSaved, toggleInCollection, setNote } = useSavedListings();
  const [activeCollectionId, setActiveCollectionId] = useState(DEFAULT_SAVED_COLLECTION_ID);
  const [mapView, setMapView] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [collectionError, setCollectionError] = useState<string | null>(null);
  const [sort, setSort] = useState<"recent" | "price-low" | "price-high">("recent");
  const activeCollection = state.collections.find((collection) => collection.id === activeCollectionId) ?? state.collections[0];
  const savedListings = useMemo(() => {
    const activeIds = activeCollectionId === DEFAULT_SAVED_COLLECTION_ID
      ? savedIds
      : new Set(activeCollection?.listingIds ?? []);
    const items = listings.filter((listing) => activeIds.has(listing.id));
    if (sort === "price-low") return [...items].sort((left, right) => left.price - right.price);
    if (sort === "price-high") return [...items].sort((left, right) => right.price - left.price);
    const positions = new globalThis.Map(getSavedListingIds(state).map((id, index) => [id, index]));
    return [...items].sort((left, right) => (positions.get(right.id) ?? -1) - (positions.get(left.id) ?? -1));
  }, [activeCollection?.listingIds, activeCollectionId, listings, savedIds, sort, state]);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newCollectionName.trim();
    const error = createCollection(name);
    if (error) { setCollectionError(error); return; }
    setNewCollectionName("");
    setCreateOpen(false);
  }

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-[#f5f7fb]">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:flex sm:items-end sm:justify-between sm:gap-6">
            <div className="contents sm:block">
              <div className="hidden items-center gap-2 text-xs font-black uppercase tracking-[0.15em] text-[#2453ff] sm:flex"><FolderHeart className="size-4" />你的空间</div>
              <h1 className="col-start-1 row-start-1 font-display text-3xl font-black tracking-[-0.035em] text-[#0b1026] sm:mt-3 sm:text-[40px]">收藏清单</h1>
              <p className="col-span-2 row-start-2 max-w-2xl text-sm leading-6 text-slate-500 sm:mt-4 sm:text-base">把喜欢的房放在一起比较。清单、备注与排序都只保存在当前设备。</p>
              <div className="col-span-2 row-start-3 inline-flex w-fit items-center gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-medium leading-5 text-amber-800 sm:mt-4"><Info className="size-3.5 shrink-0" />{accountLabel}，暂不跨设备同步</div>
            </div>
            <button type="button" onClick={(event) => { event.currentTarget.focus(); setCollectionError(null); setCreateOpen(true); }} className="col-start-2 row-start-1 flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-moss sm:gap-2 sm:px-5 sm:py-3"><Plus className="size-4" />新建清单</button>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 sm:py-8 lg:px-10">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-width:none]" aria-label="收藏分组">
          {state.collections.map((collection) => {
            const count = collection.id === DEFAULT_SAVED_COLLECTION_ID ? savedIds.size : collection.listingIds.length;
            return (
              <button key={collection.id} type="button" onClick={() => setActiveCollectionId(collection.id)} className={cn("min-h-11 shrink-0 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors", activeCollectionId === collection.id ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-moss/40")}>
                {collection.name} <span className={cn("ml-1", activeCollectionId === collection.id ? "text-white/80" : "text-slate-400")}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-3 border-b border-brand/15 pb-4 sm:mt-7 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:pb-5">
          <div className="flex min-w-0 items-baseline gap-3 sm:block"><h2 className="truncate text-base font-semibold tracking-[-0.025em] text-brand-ink sm:text-xl">{activeCollection?.name ?? "全部收藏"}</h2><p className="shrink-0 text-xs text-slate-500 sm:mt-1">{savedListings.length} 套房源</p></div>
          <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
            <label className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-brand/15 bg-white px-3 text-xs font-medium text-slate-500 sm:flex-none"><span className="hidden sm:inline">排序 </span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 min-w-0 flex-1 bg-transparent text-brand-ink outline-none sm:ml-1" aria-label="收藏排序"><option value="recent">最近收藏</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option></select></label>
            <button type="button" onClick={() => setMapView((current) => !current)} aria-pressed={mapView} className={cn("flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border px-3.5 py-2 text-xs font-medium", mapView ? "border-[#2453ff] bg-brand-soft text-[#2453ff]" : "border-brand/15 bg-white text-brand-ink")}>{mapView ? <List className="size-4" /> : <Map className="size-4" />}{mapView ? "列表" : "地图"}</button>
          </div>
        </div>

        {savedListings.length ? (
          <div className={cn("mt-5 grid gap-6 sm:mt-7", mapView ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]" : "")}>
            <div className={cn("gap-6 sm:grid-cols-2", mapView ? "hidden lg:grid" : "grid lg:grid-cols-3 xl:grid-cols-4")}>
              {savedListings.map((listing) => (
                <article key={listing.id} className="group overflow-hidden rounded-[24px] border border-[#e3e6ef] bg-white shadow-sm transition-[border-color,box-shadow] duration-300 hover:border-[#0b1026] hover:shadow-[0_18px_40px_rgba(11,16,38,0.1)]">
                  <Link href={`/listing/${encodeURIComponent(listing.id)}`} className="relative block aspect-[4/3] overflow-hidden bg-slate-200">
                    <Image src={listing.image} alt={listing.title} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.035]" />
                    <span className="absolute left-3 top-3 rounded-full bg-white/92 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 shadow-sm"><ShieldCheck className="mr-1 inline size-3.5" />信任信息</span>
                  </Link>
                  <div className="relative p-4">
                    <button type="button" onClick={() => toggleSaved(listing.id)} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-[#2453ff]" aria-label={`取消收藏 ${listing.title}`}><Heart className="size-4 fill-current" /></button>
                    <Link href={`/listing/${encodeURIComponent(listing.id)}`} className="block pr-12"><h3 className="line-clamp-2 text-base font-bold leading-snug text-[#0b1026] group-hover:text-[#2453ff]">{listing.title}</h3><p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><MapPin className="size-3.5" />{listing.area}</p></Link>
                    <div className="mt-3 flex items-end justify-between"><p className="font-display text-[23px] font-bold tabular-nums text-[#0b1026]">${listing.price.toLocaleString("en-US")} <span className="text-xs font-medium text-brand-moss">/ 月</span></p><span className="flex items-center gap-1 text-xs font-medium text-brand-moss"><Star className="size-3.5 fill-amber-400 text-amber-400" />{listing.score}</span></div>
                    <SavedListingNote value={state.notes[listing.id] ?? ""} onSave={(note) => setNote(listing.id, note)} label={`${listing.title} 的收藏备注`} />
                    {state.collections.length > 1 ? <label className="mt-3 flex items-center justify-between text-xs font-bold text-slate-500">加入清单<select aria-label={`${listing.title} 所属清单`} className="min-h-11 max-w-[150px] rounded-full border border-slate-200 bg-white px-2 py-1.5 text-slate-700" value="" onChange={(event) => { if (event.target.value) toggleInCollection(listing.id, event.target.value); }}><option value="">选择清单</option>{state.collections.filter((collection) => collection.id !== DEFAULT_SAVED_COLLECTION_ID).map((collection) => <option key={collection.id} value={collection.id}>{collection.listingIds.includes(listing.id) ? "✓ " : ""}{collection.name}</option>)}</select></label> : null}
                  </div>
                </article>
              ))}
            </div>
            {mapView ? <SavedMap listings={savedListings} /> : null}
          </div>
        ) : (
          <section className="mt-5 grid place-items-center rounded-[20px] border border-dashed border-brand/25 bg-white px-5 py-7 text-center sm:mt-8 sm:min-h-[320px] sm:px-6 sm:py-12">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-full bg-brand-soft text-[#2453ff] sm:size-16"><Heart className="size-6 sm:size-7" /></span>
              <h2 className="mt-4 text-xl font-semibold tracking-[-0.025em] text-brand-ink sm:mt-5 sm:text-2xl">还没有收藏房源</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600 sm:mt-3">浏览房源时点击爱心，这里就会成为一个干净、好比较的收藏空间。</p>
              <Link href="/search" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#2453ff] px-5 py-3 text-sm font-semibold text-white sm:mt-6"><Search className="size-4" />去找房</Link>
            </div>
          </section>
        )}
      </div>

      {createOpen ? (
        <NewCollectionDialog name={newCollectionName} error={collectionError} onNameChange={(name) => { setNewCollectionName(name); setCollectionError(null); }} onSubmit={handleCreate} onClose={() => setCreateOpen(false)} />
      ) : null}
    </main>
  );
}

function SavedListingNote({ value, onSave, label }: { value: string; onSave: (note: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setDraft(value); }, [value]);
  return <textarea value={draft} onChange={(event) => { edited.current = true; setDraft(event.target.value); }} onBlur={() => {
    if (!edited.current) return;
    edited.current = false;
    onSave(draft);
  }} aria-label={label} placeholder="添加仅自己可见的备注…" className="mt-4 min-h-16 w-full resize-none rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-base leading-6 outline-none sm:text-sm focus:border-brand-moss focus:bg-white" />;
}

function NewCollectionDialog({ name, error, onNameChange, onSubmit, onClose }: {
  name: string;
  error: string | null;
  onNameChange: (name: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLFormElement>(null);
  useModalFocus(dialog, onClose);

  return (
    <div className="marketplace-modal-backdrop fixed inset-0 z-[80] grid place-items-center bg-brand/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => onClose()}>
      <form ref={dialog} onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="marketplace-modal-panel max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="create-list-title">
        <div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#2453ff]">整理收藏</p><h2 id="create-list-title" className="mt-1 text-2xl font-semibold">新建清单</h2></div><button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full border border-slate-200" aria-label="关闭"><X className="size-4" /></button></div>
        <label className="mt-6 block text-sm font-semibold">清单名称<input aria-invalid={Boolean(error)} aria-describedby={error ? "collection-name-error" : undefined} value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="例如：九月入住" className="mt-2 h-12 w-full rounded-[16px] border border-slate-200 px-4 text-base outline-none focus:border-brand-moss sm:text-sm" /></label>
        {error ? <p id="collection-name-error" role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p> : null}
        <button type="submit" className="mt-6 w-full rounded-full bg-brand px-5 py-3 text-sm font-semibold text-white">创建清单</button>
      </form>
    </div>
  );
}

export function SavedMap({ listings }: { listings: PreviewListing[] }) {
  const canvas = useRef<HTMLElement>(null);
  const [mapSize, setMapSize] = useState({ width: 720, height: 620 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const center = useMemo(() => getMapCenterForListings(listings), [listings]);
  // Fit actual coordinates without clamping homes from different cities to map edges.
  const zoom = useMemo(() => {
    for (let candidate = 11; candidate >= 2; candidate--) {
      const points = getMapMarkers(listings, center, candidate, mapSize, false);
      if (points.every((point) => point.x > 50 && point.x < mapSize.width - 50 && point.y > 60 && point.y < mapSize.height - 40)) return candidate;
    }
    return 2;
  }, [center, listings, mapSize]);
  const tiles = getMapTiles(center, zoom, mapSize);
  const markers = getMapMarkers(listings, center, zoom, mapSize, false);
  const clusters = clusterSearchMarkers(markers);
  const selectedListings = listings.filter((listing) => selectedIds.includes(listing.id));
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
    <aside ref={canvas} className="relative h-[60dvh] min-h-[360px] overflow-hidden rounded-[20px] bg-[#e6ebf3] sm:rounded-[28px] lg:sticky lg:top-[96px] lg:h-[calc(100dvh-120px)] lg:min-h-[620px]" aria-label="收藏房源地图">
      <div className="absolute inset-0" aria-hidden="true">
        {tiles.map((tile) => <div key={tile.id} className="absolute size-64 select-none bg-cover bg-center" style={{ backgroundImage: `url(${tile.url})`, left: tile.x, top: tile.y }} />)}
      </div>
      {clusters.map((cluster) => {
        const marker = cluster.items[0];
        const position = { left: cluster.x, top: cluster.y };
        const className = "font-display absolute z-20 flex min-h-11 -translate-x-1/2 -translate-y-1/2 items-center rounded-full border-2 border-white bg-[#0b1026] px-3 py-2 text-xs font-bold text-white shadow-xl";
        return cluster.items.length > 1
          ? <button key={cluster.items.map((item) => item.id).join(",")} type="button" style={position} className={className} aria-label={`查看此区域 ${cluster.items.length} 套收藏房源`} aria-haspopup="dialog" onClick={(event) => { event.currentTarget.focus(); setSelectedIds(cluster.items.map((item) => item.id)); }}>{cluster.items.length} 套收藏房源</button>
          : <Link key={marker.id} href={`/listing/${encodeURIComponent(marker.id)}`} style={position} className={className} aria-label={`查看 ${marker.title ?? marker.area} ${marker.label} / 月`}>{marker.label}</Link>;
      })}
      <div className="absolute left-4 top-4 z-30 rounded-full bg-white/94 px-4 py-2 text-xs font-semibold shadow-lg">{listings.length} 个收藏位置</div>
      <span className="absolute bottom-2 right-3 z-30 rounded bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{attribution}</span>
      {selectedListings.length ? <SavedMapClusterDialog listings={selectedListings} onClose={() => setSelectedIds([])} /> : null}
    </aside>
  );
}

function SavedMapClusterDialog({ listings, onClose }: { listings: PreviewListing[]; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, onClose);
  return <div className="marketplace-modal-backdrop fixed inset-0 z-[80] grid place-items-center bg-brand/35 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="saved-map-cluster-title" className="marketplace-modal-panel max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-[20px] bg-white p-5 shadow-2xl">
      <header className="flex items-center justify-between gap-3"><h2 id="saved-map-cluster-title" className="min-w-0 text-base font-bold">此区域的 {listings.length} 套收藏房源</h2><button type="button" onClick={onClose} aria-label="关闭区域收藏房源" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-slate-100"><X className="size-5" /></button></header>
      <div className="mt-3 space-y-2">{listings.map((listing) => <Link key={listing.id} href={`/listing/${encodeURIComponent(listing.id)}`} className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm hover:bg-brand-soft"><span className="min-w-0 break-words">{listing.title}</span><strong className="shrink-0 text-xs">${listing.price.toLocaleString("en-US")}/月</strong></Link>)}</div>
    </section>
  </div>;
}
