"use client";

import { Info, List, Map, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, type FormEvent } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { ListingCard } from "@/components/marketplace/listing-card";
import { ListingMap } from "@/components/marketplace/listing-map";
import { PageHeader } from "@/components/marketplace/page-header";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
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
    // Collections append on save, so position in the id list is save order; newest first for "recent".
    const orderedIds = activeCollectionId === DEFAULT_SAVED_COLLECTION_ID
      ? [...savedIds]
      : activeCollection?.listingIds ?? [];
    const savedOrder = new globalThis.Map(orderedIds.map((id, index) => [id, index]));
    const items = listings.filter((listing) => savedOrder.has(listing.id));
    if (sort === "price-low") return [...items].sort((left, right) => left.price - right.price);
    if (sort === "price-high") return [...items].sort((left, right) => right.price - left.price);
    return [...items].sort((left, right) => (savedOrder.get(right.id) ?? 0) - (savedOrder.get(left.id) ?? 0));
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
    <main className="min-h-[calc(100dvh-72px)] bg-background">
      <div className="page-container pb-16 pt-8 sm:pt-12">
        <PageHeader
          title="收藏清单"
          description="把喜欢的房放在一起比较。清单、备注和排序都只保存在这台设备上。"
          action={<button type="button" onClick={() => setCreateOpen(true)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-primary px-5 font-rounded text-[15px] font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97] sm:text-sm"><Plus className="size-4" aria-hidden="true" />新建清单</button>}
        >
          <p className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-psw-sm bg-warning-soft px-2.5 py-1 text-m-footnote font-semibold text-warning-text"><Info className="size-3.5 shrink-0" aria-hidden="true" />{accountLabel}，暂不跨设备同步</p>
        </PageHeader>

        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label="收藏分组">
          {state.collections.map((collection) => {
            const count = collection.id === DEFAULT_SAVED_COLLECTION_ID ? savedIds.size : collection.listingIds.length;
            return (
              <button key={collection.id} type="button" aria-pressed={activeCollectionId === collection.id} onClick={() => setActiveCollectionId(collection.id)} className={cn("search-pill", activeCollectionId === collection.id && "search-pill-active")}>
                {collection.name} <span className={cn("font-display", activeCollectionId === collection.id ? "text-on-primary" : "text-ink-secondary")}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-b border-line-strong pb-4">
          <div className="min-w-0"><h2 className="truncate text-m-headline sm:text-d-headline">{activeCollection?.name ?? "全部收藏"}</h2><p className="mt-0.5 text-m-footnote text-ink-secondary">{savedListings.length} 套房源</p></div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="flex items-center gap-2 text-m-footnote text-ink-secondary"><span className="hidden sm:inline">排序</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="min-h-11 rounded-full border-[1.5px] border-outline bg-surface px-4 text-base font-bold text-ink outline-none sm:text-sm" aria-label="收藏排序"><option value="recent">最近收藏</option><option value="price-low">价格从低到高</option><option value="price-high">价格从高到低</option></select></label>
            <button type="button" onClick={() => setMapView((current) => !current)} aria-pressed={mapView} className={cn("search-pill", mapView && "search-pill-active")}>{mapView ? <List className="size-4" aria-hidden="true" /> : <Map className="size-4" aria-hidden="true" />}{mapView ? "列表" : "地图"}</button>
          </div>
        </div>

        {savedListings.length ? (
          <div className={cn("mt-6 grid gap-6", mapView ? "lg:grid-cols-[minmax(0,1fr)_minmax(420px,0.85fr)]" : "")}>
            <div className={cn("gap-6", mapView ? "hidden lg:grid lg:grid-cols-2" : "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))]")}>
              {savedListings.map((listing) => (
                <div key={listing.id} className="flex min-w-0 flex-col gap-2">
                  <ListingCard listing={listing} href={`/listing/${encodeURIComponent(listing.id)}`} saved onToggleSave={() => toggleSaved(listing.id)} sizes="(max-width: 640px) 100vw, 33vw" />
                  <div className="flex flex-col gap-2 rounded-psw-lg bg-surface p-3">
                    <textarea defaultValue={state.notes[listing.id] ?? ""} onBlur={(event) => setNote(listing.id, event.target.value)} aria-label={`${listing.title} 的收藏备注`} placeholder="添加只有自己看得到的备注…" className="min-h-16 w-full resize-none rounded-psw-md border border-control-border bg-surface px-3 py-2 text-base outline-none focus:border-primary sm:text-d-subhead" />
                    {state.collections.length > 1 ? <label className="flex items-center justify-between gap-3 text-m-footnote font-semibold text-ink-secondary">加入清单<select aria-label={`${listing.title} 所属清单`} className="min-h-11 max-w-[170px] rounded-full border-[1.5px] border-outline bg-surface px-3 text-base text-ink sm:text-sm" value="" onChange={(event) => { if (event.target.value) toggleInCollection(listing.id, event.target.value); }}><option value="">选择清单</option>{state.collections.filter((collection) => collection.id !== DEFAULT_SAVED_COLLECTION_ID).map((collection) => <option key={collection.id} value={collection.id}>{collection.listingIds.includes(listing.id) ? "✓ " : ""}{collection.name}</option>)}</select></label> : null}
                  </div>
                </div>
              ))}
            </div>
            {mapView ? <SavedMap listings={savedListings} /> : null}
          </div>
        ) : (
          <EmptyState
            className="mt-8"
            mood="sleepy"
            title="还没有收藏房源"
            body="浏览房源时点一下爱心，房子就会收进这里，方便放在一起比较。"
            action={<Link href="/search" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary hover:bg-primary-hover active:scale-[0.97]"><Search className="size-4" aria-hidden="true" />去找房</Link>}
          />
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
    <div className="marketplace-modal-backdrop fixed inset-0 z-[80] grid place-items-center bg-ink-block/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={() => onClose()}>
      <form ref={dialog} onSubmit={onSubmit} onMouseDown={(event) => event.stopPropagation()} className="marketplace-modal-panel max-h-[calc(100dvh-32px)] w-full max-w-md overflow-y-auto rounded-psw-2xl bg-surface p-6 shadow-dialog" role="dialog" aria-modal="true" aria-labelledby="create-list-title">
        <div className="flex items-center justify-between"><h2 id="create-list-title" className="text-m-title sm:text-d-title">新建清单</h2><button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full bg-tag-neutral hover:bg-line-strong" aria-label="关闭"><X className="size-4" /></button></div>
        <label className="mt-6 block text-d-label">清单名称<input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="例如：九月入住" className="application-input mt-2" /></label>
        <button type="submit" className="mt-6 min-h-12 w-full rounded-full bg-primary px-5 font-rounded text-base font-bold text-on-primary hover:bg-primary-hover active:scale-[0.97]">创建清单</button>
      </form>
    </div>
  );
}

function SavedMap({ listings }: { listings: PreviewListing[] }) {
  const [selectedId, setSelectedId] = useState("");
  return <ListingMap label="收藏房源地图" listings={listings} fitKey={listings.map((listing) => listing.id).join(",")} selectedId={selectedId} onSelect={setSelectedId} className="h-[60dvh] min-h-[360px] rounded-psw-xl lg:sticky lg:top-[96px] lg:h-[calc(100dvh-120px)] lg:min-h-[620px]" />;
}
