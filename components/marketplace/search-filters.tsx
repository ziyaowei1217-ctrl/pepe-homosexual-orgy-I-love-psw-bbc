"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { emptyFilters, searchAmenities, searchDateError, type SearchState } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export type SearchFilterSection = "budget" | "beds" | "dates";

export function SearchFiltersDialog({ initial, initialSection = "budget", prices, getCount, onApply, onClose }: {
  initial: SearchState; prices: number[]; getCount: (filters: SearchState) => number;
  initialSection?: SearchFilterSection;
  onApply: (filters: SearchState) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const dialog = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const bedrooms = useRef<HTMLFieldSetElement>(null);
  const dates = useRef<HTMLElement>(null);
  const ceiling = Math.max(5000, Math.ceil(Math.max(0, ...prices, initial.priceMax, initial.priceMin) / 500) * 500);
  const histogram = Array.from({ length: 28 }, (_, index) => prices.filter((price) => Math.min(27, Math.floor(price / ceiling * 28)) === index).length);
  const error = searchDateError(draft.moveIn, draft.moveOut) || (draft.priceMax && draft.priceMin > draft.priceMax ? "最高预算不能低于最低预算。" : "");
  const count = error ? 0 : getCount(draft);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const target = initialSection === "dates" ? dates.current : initialSection === "beds" ? bedrooms.current : null;
    if (target && content.current) {
      target.focus({ preventScroll: true });
      content.current.scrollTop = target.offsetTop;
    }
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [initialSection]);

  const update = (patch: Partial<SearchState>) => setDraft((value) => ({ ...value, ...patch }));

  return <div className="marketplace-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/35 p-0 backdrop-blur-sm sm:items-center sm:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="filter-title" className="marketplace-modal-panel search-filter-dialog flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-white shadow-2xl sm:max-h-[88dvh] sm:max-w-[640px] sm:rounded-[28px]" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]');
      const first = nodes?.[0]; const last = nodes?.[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className="relative flex shrink-0 items-center justify-center border-b border-slate-200 px-6 py-5">
        <button type="button" onClick={onClose} aria-label="关闭筛选" className="absolute left-5 grid size-9 place-items-center rounded-full hover:bg-slate-100"><X className="size-5" /></button>
        <h2 id="filter-title" className="text-base font-bold">筛选房源</h2>
      </header>
      <div ref={content} className="relative overflow-y-auto px-6 sm:px-8">
        <section className="border-b border-slate-200 py-7">
          <h3 className="text-lg font-bold">每月预算</h3>
          <p className="mt-1 text-sm text-slate-500">按月租筛选，其他费用请在房源详情中确认。</p>
          <div className="mt-7 flex h-20 items-end gap-[3px]" aria-hidden="true">{histogram.map((count, index) => <span key={index} className={cn("flex-1 rounded-t-[3px]", index * ceiling / 28 >= draft.priceMin && (!draft.priceMax || index * ceiling / 28 < draft.priceMax) ? "bg-[#0668e1]/75" : "bg-slate-200")} style={{ height: `${Math.max(4, count / Math.max(1, ...histogram) * 100)}%` }} />)}</div>
          <input type="range" min="0" max={ceiling} step="100" value={draft.priceMax || ceiling} onChange={(event) => update({ priceMax: Number(event.target.value) === ceiling ? 0 : Math.max(100, Number(event.target.value)) })} className="mt-1 w-full accent-[#0668e1]" aria-label="每月最高预算" />
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <BudgetField label="最低预算" value={draft.priceMin} placeholder="0" onChange={(priceMin) => update({ priceMin })} />
            <span className="h-px w-4 bg-slate-300" />
            <BudgetField label="最高预算" value={draft.priceMax} placeholder="不限" onChange={(priceMax) => update({ priceMax })} />
          </div>
        </section>
        <fieldset ref={bedrooms} tabIndex={-1} className="border-b border-slate-200 py-7 outline-none">
          <legend className="float-left w-full text-lg font-bold">卧室数量</legend>
          <div className="clear-both flex gap-2 pt-4">{[0, 1, 2, 3, 4].map((beds) => <button key={beds} type="button" onClick={() => update({ beds })} aria-pressed={draft.beds === beds} className={cn("min-w-0 flex-1 rounded-full border px-2 py-3 text-sm font-semibold", draft.beds === beds ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 hover:border-slate-500")}>{beds ? `${beds}+` : "不限"}</button>)}</div>
        </fieldset>
        <fieldset className="border-b border-slate-200 py-7">
          <legend className="float-left w-full text-lg font-bold">让生活更方便</legend>
          <p className="clear-both pt-1 text-sm text-slate-500">可多选，房源需同时满足所选条件。</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{searchAmenities.map((amenity) => <button key={amenity} type="button" aria-pressed={draft.amenities.includes(amenity)} onClick={() => update({ amenities: draft.amenities.includes(amenity) ? draft.amenities.filter((value) => value !== amenity) : [...draft.amenities, amenity] })} className={cn("flex items-center justify-between rounded-2xl border px-4 py-4 text-sm font-semibold", draft.amenities.includes(amenity) ? "border-slate-950 bg-slate-50 ring-1 ring-slate-950" : "border-slate-200 hover:border-slate-400")}>
            {amenity}<Check className={cn("size-4", !draft.amenities.includes(amenity) && "invisible")} />
          </button>)}</div>
        </fieldset>
        <section ref={dates} tabIndex={-1} aria-labelledby="filter-dates-title" className="py-7 outline-none">
          <div className="flex items-center justify-between"><h3 id="filter-dates-title" className="text-lg font-bold">入住与退租</h3><button type="button" onClick={() => update({ moveIn: "", moveOut: "" })} className="text-xs font-semibold underline">日期灵活</button></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="rounded-2xl border border-slate-200 p-3 text-xs text-slate-500">入住日期<input type="date" aria-label="筛选入住日期" value={draft.moveIn} onChange={(event) => update({ moveIn: event.target.value })} className="mt-2 block w-full min-w-0 bg-transparent text-sm font-semibold text-slate-950" /></label>
            <label className="rounded-2xl border border-slate-200 p-3 text-xs text-slate-500">退租日期<input type="date" aria-label="筛选退租日期" value={draft.moveOut} min={draft.moveIn} onChange={(event) => update({ moveOut: event.target.value })} className="mt-2 block w-full min-w-0 bg-transparent text-sm font-semibold text-slate-950" /></label>
          </div>
          {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 sm:px-8">
        <button type="button" onClick={() => update({ ...emptyFilters, moveIn: "", moveOut: "" })} className="rounded-lg py-2 text-sm font-bold underline underline-offset-4">全部重置</button>
        <button type="button" disabled={Boolean(error)} onClick={() => onApply(draft)} className="rounded-xl bg-[#0668e1] px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-40">查看 {count} 套房源</button>
      </footer>
    </section>
  </div>;
}

function BudgetField({ label, value, placeholder, onChange }: { label: string; value: number; placeholder: string; onChange: (value: number) => void }) {
  return <label className="min-w-0 rounded-2xl border border-slate-300 px-4 py-3 text-xs text-slate-500">{label}<span className="mt-1 flex items-center gap-2 text-base text-slate-950">$<input type="number" aria-label={label} min="0" max="1000000" step="100" value={value || ""} placeholder={placeholder} onChange={(event) => onChange(Math.min(1_000_000, Math.max(0, Number(event.target.value))))} className="w-full min-w-0 bg-transparent font-semibold outline-none" /></span></label>;
}
