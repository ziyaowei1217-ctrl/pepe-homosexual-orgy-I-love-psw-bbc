"use client";

import { Check, X } from "lucide-react";
import { useRef, useState } from "react";

import { BudgetField } from "@/components/marketplace/search-filters";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { destinationSuggestions } from "@/lib/listing-match";
import { localDate } from "@/lib/listing-stay";
import { emptyRenterPreferences, normalizeRenterPreferences, type RenterPreferences } from "@/lib/renter-preferences";
import { searchAmenities } from "@/lib/search-state";
import { cn } from "@/lib/utils";

/** Edits the renter's matching preferences. They rank listings; they never hide one. */
export function MatchPreferencesDialog({ initial, onSave, onClose }: {
  initial: RenterPreferences; onSave: (preferences: RenterPreferences) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const dialog = useRef<HTMLElement>(null);
  useModalFocus(dialog, onClose);
  const today = localDate();
  const update = (patch: Partial<RenterPreferences>) => setDraft((value) => ({ ...value, ...patch }));
  const error = draft.moveOut && !draft.moveIn ? "请先选择入住日期。" : draft.moveOut && draft.moveOut <= draft.moveIn ? "退租日期需要晚于入住日期。" : "";

  return <div className="marketplace-modal-backdrop fixed inset-0 z-[85] flex items-end justify-center bg-ink-block/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="match-preferences-title" className="marketplace-modal-panel flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:max-h-[88dvh] sm:max-w-[560px] sm:rounded-[28px]">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line-strong px-6 py-5">
        <div><h2 id="match-preferences-title" className="text-xl font-bold">匹配偏好</h2><p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">用来给房源排序和算匹配度，不会隐藏房源。只保存在这台设备上。</p></div>
        <button type="button" onClick={onClose} aria-label="关闭匹配偏好" className="grid size-10 shrink-0 place-items-center rounded-full bg-tag-neutral hover:bg-line-strong"><X className="size-5" /></button>
      </header>
      <div className="space-y-7 overflow-y-auto px-6 py-6">
        <label className="block text-d-label text-ink">学校、公司或街区
          <input value={draft.destination} onChange={(event) => update({ destination: event.target.value })} list="match-destinations" maxLength={80} placeholder="例如 UCLA" className="mt-2 block min-h-12 w-full rounded-psw-md border border-control-border bg-surface px-4 text-base font-semibold text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm" />
          <datalist id="match-destinations">{destinationSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <div className="grid grid-cols-[1fr] sm:grid-cols-[220px]"><BudgetField label="每月最高预算" value={draft.budgetMax} placeholder="不限" onChange={(budgetMax) => update({ budgetMax })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <label className="rounded-psw-md border border-control-border p-3 text-m-footnote font-semibold text-ink-secondary">入住日期<input type="date" value={draft.moveIn} min={today} onChange={(event) => update({ moveIn: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink sm:text-sm" /></label>
          <label className="rounded-psw-md border border-control-border p-3 text-m-footnote font-semibold text-ink-secondary">退租日期（可不填）<input type="date" value={draft.moveOut} min={draft.moveIn || today} onChange={(event) => update({ moveOut: event.target.value })} className="mt-1 block w-full min-w-0 bg-transparent text-base font-semibold text-ink sm:text-sm" /></label>
        </div>
        <fieldset>
          <legend className="text-d-label text-ink">卧室数量</legend>
          <div className="mt-3 flex gap-2">{[0, 1, 2, 3, 4].map((beds) => <button key={beds} type="button" onClick={() => update({ beds })} aria-pressed={draft.beds === beds} className={cn("min-h-11 min-w-0 flex-1 rounded-full border-[1.5px] px-2 text-[15px] font-semibold sm:text-sm", draft.beds === beds ? "border-primary bg-primary text-on-primary" : "border-line-strong hover:border-control-border")}>{beds ? `${beds}+` : "不限"}</button>)}</div>
        </fieldset>
        <fieldset>
          <legend className="text-d-label text-ink">必须有</legend>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{searchAmenities.map((amenity) => {
            const selected = draft.mustHave.includes(amenity);
            return <button key={amenity} type="button" aria-pressed={selected} onClick={() => update({ mustHave: selected ? draft.mustHave.filter((value) => value !== amenity) : [...draft.mustHave, amenity] })} className={cn("flex min-h-12 items-center justify-between rounded-psw-md border-[1.5px] px-4 text-[15px] font-semibold sm:text-sm", selected ? "border-ink bg-surface-muted ring-1 ring-ink" : "border-line-strong hover:border-control-border")}>
              {amenity}<Check className={cn("size-4", !selected && "invisible")} aria-hidden="true" />
            </button>;
          })}</div>
        </fieldset>
        {error ? <p role="alert" className="text-d-subhead text-danger-text">{error}</p> : null}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-strong px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
        <button type="button" onClick={() => setDraft(emptyRenterPreferences)} className="min-h-11 text-[15px] font-bold underline underline-offset-4 sm:text-sm">全部清除</button>
        <button type="button" disabled={Boolean(error)} onClick={() => onSave(normalizeRenterPreferences(draft))} className="min-h-12 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97] disabled:opacity-40">保存偏好</button>
      </footer>
    </section>
  </div>;
}
