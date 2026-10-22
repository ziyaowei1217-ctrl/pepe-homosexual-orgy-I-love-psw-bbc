"use client";

import { ChevronLeft, ChevronRight, Expand, Grid2X2, ImageIcon, X } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import { useRef, useState } from "react";
import { buildListingGallery, getGalleryIndex } from "@/lib/listing-detail";
import type { PreviewListing } from "@/lib/preview-data";
import { cn } from "@/lib/utils";
import { useModalFocus } from "./use-modal-focus";

export function ListingPhotoGallery({ listing }: { listing: PreviewListing }) {
  const images = buildListingGallery(listing);
  const [active, setActive] = useState<number | null>(null);
  const count = Math.min(images.length, 5);
  return <>
    <section id="listing-photos" className="relative grid h-[300px] scroll-mt-36 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-[24px] bg-tag-neutral sm:h-[380px] lg:h-[430px]" aria-label="房源图片">
      {images.slice(0, 5).map((src, index) => <button key={src} type="button" aria-label={`查看图片 ${index + 1}`} onClick={() => setActive(index)} className={cn("group relative overflow-hidden bg-line-strong focus-visible:z-10 focus-visible:ring-inset", index === 0 ? "col-span-4 row-span-2" : "hidden sm:block", index === 0 && count > 1 && "sm:col-span-2", index > 0 && count <= 3 && "sm:col-span-2", count === 2 && index === 1 && "sm:row-span-2", count === 4 && index === 3 && "sm:col-span-2")}>
        <SmartImage src={src} alt={index === 0 ? listing.title : `${listing.title} 图片 ${index + 1}`} fill priority={index === 0} sizes={count === 1 ? "100vw" : index === 0 ? "(max-width: 640px) 100vw, 50vw" : "25vw"} className="object-cover transition duration-300 group-hover:scale-[1.025] group-hover:brightness-95" />
      </button>)}
      {!images.length ? <div className="col-span-4 row-span-2 grid place-content-center gap-3 text-center text-ink-secondary"><ImageIcon className="mx-auto size-10" /><p className="text-d-subhead">转租人暂未提供图片</p></div> : <button type="button" onClick={() => setActive(0)} className="tap-target absolute bottom-4 right-4 flex h-9 items-center gap-2 rounded-full bg-photo-button px-4 text-m-footnote font-semibold text-ink shadow-menu">{images.length > 1 ? <><Grid2X2 className="size-4" aria-hidden="true" />查看全部 {images.length} 张</> : <><Expand className="size-4" aria-hidden="true" />放大看照片</>}</button>}
    </section>
    {active !== null ? <PhotoViewer title={listing.title} images={images} initialIndex={active} onClose={() => setActive(null)} /> : null}
  </>;
}

function PhotoViewer({ title, images, initialIndex, onClose }: { title: string; images: string[]; initialIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(initialIndex);
  const dialog = useRef<HTMLElement>(null);
  const touch = useRef<number | null>(null);
  useModalFocus(dialog, onClose);
  const navigate = (direction: -1 | 1) => setIndex((current) => getGalleryIndex(current, direction, images.length));
  return <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="gallery-title" className="marketplace-modal-backdrop fixed inset-0 z-[90] flex flex-col bg-ink-block text-white" onKeyDown={(event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); navigate(event.key === "ArrowLeft" ? -1 : 1); }
  }}>
    <header className="flex shrink-0 items-center gap-4 border-b border-surface/10 px-4 py-4 sm:px-8">
      <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full bg-surface/10 hover:bg-surface/20" aria-label="关闭全部图片"><X className="size-5" /></button>
      <div className="min-w-0 flex-1"><h2 id="gallery-title" className="text-base font-bold">全部图片</h2><p className="mt-1 truncate text-xs text-white/55">{images.length} 张 · {title}</p></div>
      <span role="status" aria-live="polite" className="shrink-0 text-sm tabular-nums text-white/80">{index + 1} / {images.length}</span>
    </header>
    <div className="relative min-h-0 flex-1" onTouchStart={(event) => { touch.current = event.touches[0]?.clientX ?? null; }} onTouchEnd={(event) => {
      const end = event.changedTouches[0]?.clientX;
      if (touch.current !== null && end !== undefined && Math.abs(end - touch.current) > 45) navigate(end < touch.current ? 1 : -1);
      touch.current = null;
    }}>
      <figure className="absolute inset-3 sm:inset-x-20 sm:inset-y-5"><SmartImage src={images[index]} alt={`${title} 图片 ${index + 1}`} fill sizes="100vw" className="object-contain" /></figure>
      {images.length > 1 ? <><button type="button" onClick={() => navigate(-1)} aria-label="上一张图片" className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-surface/15 bg-ink-block/65 hover:bg-ink-secondary sm:left-6"><ChevronLeft className="size-6" /></button><button type="button" onClick={() => navigate(1)} aria-label="下一张图片" className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-surface/15 bg-ink-block/65 hover:bg-ink-secondary sm:right-6"><ChevronRight className="size-6" /></button></> : null}
    </div>
    <footer className="shrink-0 border-t border-surface/10 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-4">
      <div className="mx-auto flex max-w-3xl gap-3 overflow-x-auto px-1 py-1" aria-label="图片缩略图">{images.map((src, photo) => <button key={src} type="button" aria-label={`跳转到图片 ${photo + 1}`} aria-pressed={photo === index} onClick={() => setIndex(photo)} className={cn("relative h-14 w-20 shrink-0 overflow-hidden rounded-lg transition-opacity sm:h-16 sm:w-24", photo === index ? "ring-2 ring-white ring-offset-2 ring-offset-ink" : "opacity-45 hover:opacity-80")}><SmartImage src={src} alt="" fill sizes="96px" className="object-cover" /></button>)}</div>
      <p className="mt-3 text-center text-[11px] text-white/40">{images.length > 1 ? "左右滑动或使用方向键切换图片 · " : ""}Esc 关闭</p>
    </footer>
  </section>;
}
