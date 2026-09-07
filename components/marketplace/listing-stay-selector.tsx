"use client";

import { CalendarDays, X } from "lucide-react";
import { useRef, useState } from "react";
import { earliestListingDate, listingStayError, type ListingStay } from "@/lib/listing-stay";
import type { PreviewListing } from "@/lib/preview-data";
import { useModalFocus } from "./use-modal-focus";

export function ListingStayFields({ listing, stay, onChange }: { listing: PreviewListing; stay: ListingStay; onChange: (stay: ListingStay) => void }) {
  const earliest = earliestListingDate(listing);
  return <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-300 focus-within:border-[#0668e1] focus-within:ring-1 focus-within:ring-[#0668e1]">
    <label className="min-w-0 p-3 text-[11px] font-semibold text-slate-500">入住日期<input type="date" min={earliest} max={listing.availableTo || undefined} value={stay.moveIn} onChange={(event) => onChange({ ...stay, moveIn: event.target.value })} className="mt-2 block w-full min-w-0 bg-transparent text-sm font-semibold text-slate-950" /></label>
    <label className="min-w-0 border-l border-slate-300 p-3 text-[11px] font-semibold text-slate-500">退租日期<input type="date" min={stay.moveIn || earliest} max={listing.availableTo || undefined} value={stay.moveOut} onChange={(event) => onChange({ ...stay, moveOut: event.target.value })} className="mt-2 block w-full min-w-0 bg-transparent text-sm font-semibold text-slate-950" /></label>
  </div>;
}

export function ListingStayDialog({ listing, stay, onApply, onClose }: { listing: PreviewListing; stay: ListingStay; onApply: (stay: ListingStay) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(stay);
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, onClose);
  const error = listingStayError(draft, listing);
  return <div className="marketplace-modal-backdrop fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="stay-dialog-title" className="marketplace-modal-panel max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
      <header className="flex items-center justify-between gap-4"><h2 id="stay-dialog-title" className="text-xl font-bold">选择租期</h2><button type="button" onClick={onClose} aria-label="关闭租期选择" className="grid size-10 place-items-center rounded-full bg-slate-100 hover:bg-slate-200"><X className="size-5" /></button></header>
      <p className="mb-6 mt-2 text-sm leading-6 text-slate-500">{listing.title}</p>
      <ListingStayFields listing={listing} stay={draft} onChange={setDraft} />
      <p className="mt-4 flex gap-2 text-xs leading-6 text-slate-500"><CalendarDays className="mt-1 size-4 shrink-0" />可租日期：{earliestListingDate(listing)} 至 {listing.availableTo || "待确认"}</p>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p> : <p className="mt-3 text-sm text-emerald-700">所选日期在房源可租期内</p>}
      <button type="button" disabled={Boolean(error)} onClick={() => onApply(draft)} className="mt-6 w-full rounded-xl bg-[#0668e1] py-3.5 text-sm font-bold text-white disabled:opacity-40">确认租期</button>
    </section>
  </div>;
}
