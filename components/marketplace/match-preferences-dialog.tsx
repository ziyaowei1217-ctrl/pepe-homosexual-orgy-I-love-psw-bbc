"use client";

import { X } from "lucide-react";
import { useRef, useState } from "react";

import { AmenityField, BedsField, BudgetField, DateField } from "@/components/marketplace/search-filters";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { destinationSuggestions } from "@/lib/listing-match";
import { localDate } from "@/lib/listing-stay";
import { emptyRenterPreferences, type RenterPreferences } from "@/lib/renter-preferences";

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
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="match-preferences-title" className="marketplace-modal-panel flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-psw-2xl bg-surface shadow-dialog sm:max-h-[88dvh] sm:max-w-[560px] sm:rounded-psw-2xl">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line-strong px-6 py-5">
        <div><h2 id="match-preferences-title" className="font-rounded text-m-title text-ink sm:text-d-title">匹配偏好</h2><p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">用来给房源排序和算匹配度，不会隐藏房源。只保存在这台设备上。</p></div>
        <button type="button" onClick={onClose} aria-label="关闭匹配偏好" className="grid size-11 shrink-0 place-items-center rounded-full bg-tag-neutral hover:bg-line-strong"><X className="size-5" /></button>
      </header>
      <div className="space-y-7 overflow-y-auto px-6 py-6">
        <label className="block text-d-label text-ink">学校、公司或街区
          <input value={draft.destination} onChange={(event) => update({ destination: event.target.value })} list="match-destinations" maxLength={80} placeholder="例如 UCLA" className="mt-2 block min-h-12 w-full rounded-psw-md border border-control-border bg-surface px-4 text-base font-semibold text-ink placeholder:text-ink-placeholder sm:text-sm" />
          <datalist id="match-destinations">{destinationSuggestions.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
        <div className="grid grid-cols-[1fr] sm:grid-cols-[220px]"><BudgetField label="每月最高预算" value={draft.budgetMax} placeholder="不限" onChange={(budgetMax) => update({ budgetMax })} /></div>
        <div className="grid grid-cols-2 gap-3">
          <DateField label="入住日期" value={draft.moveIn} min={today} onChange={(moveIn) => update({ moveIn })} />
          <DateField label="退租日期（可不填）" value={draft.moveOut} min={draft.moveIn || today} onChange={(moveOut) => update({ moveOut })} />
        </div>
        <fieldset>
          <legend className="text-d-label text-ink">卧室数量</legend>
          <BedsField value={draft.beds} onChange={(beds) => update({ beds })} className="mt-3" />
        </fieldset>
        <fieldset>
          <legend className="text-d-label text-ink">必须有</legend>
          <AmenityField value={draft.mustHave} onChange={(mustHave) => update({ mustHave })} className="mt-3" />
        </fieldset>
        {error ? <p role="alert" className="text-d-subhead text-danger-text">{error}</p> : null}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-strong px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-5">
        <button type="button" onClick={() => setDraft(emptyRenterPreferences)} className="min-h-11 text-m-subhead font-bold text-ink underline underline-offset-4 sm:text-d-subhead">全部重置</button>
        <button type="button" disabled={Boolean(error)} onClick={() => onSave(draft)} className="min-h-12 rounded-full bg-primary px-6 font-rounded text-base font-bold text-on-primary transition-colors hover:bg-primary-hover active:scale-[0.97] disabled:opacity-40">保存偏好</button>
      </footer>
    </section>
  </div>;
}
