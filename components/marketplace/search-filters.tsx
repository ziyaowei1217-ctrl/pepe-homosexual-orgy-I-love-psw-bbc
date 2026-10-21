"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { localDate } from "@/lib/listing-stay";
import { emptyFilters, searchAmenities, searchDateError, type SearchState } from "@/lib/search-state";
import { cn } from "@/lib/utils";

export type SearchFilterSection = "budget" | "beds" | "dates";

export function SearchFiltersDialog({ initial, initialSection = "budget", prices, getCount, onApply, onClose }: {
  initial: SearchState; prices: number[]; getCount: (filters: SearchState) => number;
  initialSection?: SearchFilterSection;
  onApply: (filters: SearchState) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const today = localDate();
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

  return <div className="marketplace-modal-backdrop fixed inset-0 z-[80] flex items-end justify-center bg-ink-block/35 p-0 backdrop-blur-sm sm:items-center sm:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="filter-title" className="marketplace-modal-panel search-filter-dialog flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:max-h-[88dvh] sm:max-w-[640px] sm:rounded-[28px]" onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const nodes = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]');
      const first = nodes?.[0]; const last = nodes?.[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <header className="relative flex shrink-0 items-center justify-center border-b border-line-strong px-6 py-5">
        <button type="button" onClick={onClose} aria-label="关闭筛选" className="absolute left-4 grid size-11 place-items-center rounded-full hover:bg-surface-subtle"><X className="size-5" /></button>
        <h2 id="filter-title" className="text-base font-bold">筛选房源</h2>
      </header>
      <div ref={content} className="relative overflow-y-auto px-6 sm:px-8">
        <section className="border-b border-line-strong py-7">
          <h3 className="text-lg font-bold">每月预算</h3>
          <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">按月租筛选，其他费用请在房源详情中确认。</p>
          <div className="mt-7 flex h-20 items-end gap-[3px]" aria-hidden="true">{histogram.map((count, index) => <span key={index} className={cn("flex-1 rounded-t-[3px]", index * ceiling / 28 >= draft.priceMin && (!draft.priceMax || index * ceiling / 28 < draft.priceMax) ? "bg-primary/75" : "bg-line-strong")} style={{ height: `${Math.max(4, count / Math.max(1, ...histogram) * 100)}%` }} />)}</div>
          <input type="range" min="0" max={ceiling} step="100" value={draft.priceMax || ceiling} onChange={(event) => update({ priceMax: Number(event.target.value) === ceiling ? 0 : Math.max(100, Number(event.target.value)) })} className="mt-1 w-full accent-primary" aria-label="每月最高预算" />
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <BudgetField label="最低预算" value={draft.priceMin} placeholder="0" onChange={(priceMin) => update({ priceMin })} />
            <span className="h-px w-4 bg-outline" />
            <BudgetField label="最高预算" value={draft.priceMax} placeholder="不限" onChange={(priceMax) => update({ priceMax })} />
          </div>
        </section>
        <fieldset ref={bedrooms} tabIndex={-1} className="border-b border-line-strong py-7 outline-none">
          <legend className="float-left w-full text-lg font-bold">卧室数量</legend>
          <div className="clear-both flex gap-2 pt-4">{[0, 1, 2, 3, 4].map((beds) => <button key={beds} type="button" onClick={() => update({ beds })} aria-pressed={draft.beds === beds} className={cn("min-h-11 min-w-0 flex-1 rounded-full border-[1.5px] px-2 text-[15px] font-semibold sm:text-sm", draft.beds === beds ? "border-primary bg-primary text-white" : "border-line-strong hover:border-control-border")}>{beds ? `${beds}+` : "不限"}</button>)}</div>
        </fieldset>
        <fieldset className="border-b border-line-strong py-7">
          <legend className="float-left w-full text-lg font-bold">让生活更方便</legend>
          <p className="clear-both pt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">可多选，房源需同时满足所选条件。</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{searchAmenities.map((amenity) => <button key={amenity} type="button" aria-pressed={draft.amenities.includes(amenity)} onClick={() => update({ amenities: draft.amenities.includes(amenity) ? draft.amenities.filter((value) => value !== amenity) : [...draft.amenities, amenity] })} className={cn("flex min-h-12 items-center justify-between rounded-psw-md border-[1.5px] px-4 text-[15px] font-semibold sm:text-sm", draft.amenities.includes(amenity) ? "border-ink bg-surface-muted ring-1 ring-ink" : "border-line-strong hover:border-control-border")}>
            {amenity}<Check className={cn("size-4", !draft.amenities.includes(amenity) && "invisible")} />
          </button>)}</div>
        </fieldset>
        <section ref={dates} tabIndex={-1} aria-labelledby="filter-dates-title" className="py-7 outline-none">
          <div className="flex items-center justify-between"><h3 id="filter-dates-title" className="text-lg font-bold">入住与退租</h3><button type="button" onClick={() => update({ moveIn: "", moveOut: "" })} className="min-h-11 px-1 text-m-footnote font-semibold underline underline-offset-4">日期灵活</button></div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <label className="rounded-psw-md border border-control-border p-3 text-m-footnote font-semibold text-ink-secondary">入住日期<input type="date" aria-label="筛选入住日期" value={draft.moveIn} min={today} onChange={(event) => update({ moveIn: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink sm:text-sm" /></label>
            <label className="rounded-psw-md border border-control-border p-3 text-m-footnote font-semibold text-ink-secondary">退租日期<input type="date" aria-label="筛选退租日期" value={draft.moveOut} min={draft.moveIn || today} onChange={(event) => update({ moveOut: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink sm:text-sm" /></label>
          </div>
          {error ? <p role="alert" className="mt-3 text-d-subhead text-danger-text">{error}</p> : null}
        </section>
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-strong bg-surface px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5 sm:px-8">
        <button type="button" onClick={() => update({ ...emptyFilters, moveIn: "", moveOut: "" })} className="min-h-11 rounded-lg text-[15px] font-bold underline underline-offset-4 sm:text-sm">全部重置</button>
        <button type="button" disabled={Boolean(error)} onClick={() => onApply(draft)} className="min-h-12 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97] disabled:opacity-40">查看 {count} 套房源</button>
      </footer>
    </section>
  </div>;
}

function BudgetField({ label, value, placeholder, onChange }: { label: string; value: number; placeholder: string; onChange: (value: number) => void }) {
  return <label className="min-w-0 rounded-psw-md border border-control-border px-4 py-3 text-m-footnote font-semibold text-ink-secondary">{label}<span className="mt-1 flex items-center gap-2 text-base text-ink">$<input type="number" aria-label={label} min="0" max="1000000" step="100" value={value || ""} placeholder={placeholder} onChange={(event) => onChange(Math.min(1_000_000, Math.max(0, Number(event.target.value))))} className="w-full min-w-0 bg-transparent font-semibold outline-none" /></span></label>;
}
