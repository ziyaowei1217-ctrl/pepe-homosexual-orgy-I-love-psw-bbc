"use client";

import { CalendarDays, X } from "lucide-react";
import { useRef, useState } from "react";
import { formatRangeLong } from "@/lib/date-format";
import { earliestListingDate, listingStayError, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { useModalFocus } from "./use-modal-focus";

export function ListingStayFields({ listing, stay, onChange, moveInId }: { listing: PreviewListing; stay: ListingStay; onChange: (stay: ListingStay) => void; moveInId?: string }) {
  const earliest = earliestListingDate(listing);
  return <div className="grid grid-cols-2 overflow-hidden rounded-psw-md border border-control-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
    <label className="min-w-0 p-3 text-m-footnote font-semibold text-ink-secondary">入住日期<input id={moveInId} type="date" min={earliest} max={listing.availableTo || undefined} value={stay.moveIn} onChange={(event) => onChange({ ...stay, moveIn: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink lg:text-sm" /></label>
    <label className="min-w-0 border-l border-control-border p-3 text-m-footnote font-semibold text-ink-secondary">退租日期<input type="date" min={stay.moveIn || earliest} max={listing.availableTo || undefined} value={stay.moveOut} onChange={(event) => onChange({ ...stay, moveOut: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink lg:text-sm" /></label>
  </div>;
}

export function ListingStayDialog({ listing, stay, onApply, onClose }: { listing: PreviewListing; stay: ListingStay; onApply: (stay: ListingStay) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(stay);
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, onClose);
  const error = listingStayError(draft, listing);
  return <div className="marketplace-modal-backdrop fixed inset-0 z-[85] flex items-end justify-center bg-ink-block/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="stay-dialog-title" className="marketplace-modal-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
      <header className="flex items-center justify-between gap-4"><h2 id="stay-dialog-title" className="text-xl font-bold">选择租期</h2><button type="button" onClick={onClose} aria-label="关闭租期选择" className="grid size-10 place-items-center rounded-full bg-tag-neutral hover:bg-line-strong"><X className="size-5" /></button></header>
      <p className="mb-6 mt-2 text-m-subhead text-ink-secondary">{listing.title}</p>
      <ListingStayFields listing={listing} stay={draft} onChange={setDraft} />
      <p className="mt-4 flex gap-2 text-m-footnote text-ink-secondary"><CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />可租日期：{listing.availableTo ? formatRangeLong(earliestListingDate(listing), listing.availableTo) : "待确认"}</p>
      {error ? <p role="alert" className="mt-3 rounded-psw-md bg-danger-soft p-3 text-d-subhead text-danger-text">{error}</p> : <p className="mt-3 text-d-subhead text-success-text">这段日期可以申请</p>}
      <button type="button" disabled={Boolean(error)} onClick={() => onApply(draft)} className="mt-6 min-h-12 w-full rounded-full bg-primary font-rounded text-base font-bold text-on-primary hover:bg-primary-hover active:scale-[0.97] disabled:opacity-40">确认租期</button>
    </section>
  </div>;
}
