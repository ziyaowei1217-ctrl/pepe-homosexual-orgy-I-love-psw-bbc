"use client";

import { useCallback, useId, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useModalFocus } from "./use-modal-focus";

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: the action cannot be taken back (reject, withdraw, delete, leave). */
  tone?: "default" | "danger";
  /** Ask for a reason in the dialog itself; the confirm button waits until one is written. */
  reason?: { label: string; placeholder?: string };
};

/**
 * psw ConfirmDialog: the site's own confirmation instead of the browser's confirm()/prompt(), which cannot be styled,
 * show the page's language inconsistently and can be silenced by the browser. A sheet on phones, a centred card elsewhere.
 */
export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = "先不", tone = "default", reason, onConfirm, onCancel }: ConfirmOptions & {
  onConfirm: (reason: string) => void; onCancel: () => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const [text, setText] = useState("");
  const titleId = useId(); const bodyId = useId(); const reasonId = useId();
  useModalFocus(panel, onCancel);
  const ready = !reason || text.trim().length > 0;
  return <div className="marketplace-modal-backdrop fixed inset-0 z-[95] flex items-end justify-center bg-ink-block/40 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
    <section ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={body ? bodyId : undefined} className="marketplace-modal-panel w-full max-w-md rounded-t-psw-2xl bg-surface p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-dialog sm:rounded-psw-xl">
      <h2 id={titleId} className="font-rounded text-m-title text-ink sm:text-d-title">{title}</h2>
      {body ? <div id={bodyId} className="mt-2 text-m-subhead text-ink-secondary sm:text-d-subhead">{body}</div> : null}
      {reason ? <label htmlFor={reasonId} className="mt-5 block text-d-label text-ink">{reason.label}
        <textarea id={reasonId} value={text} maxLength={500} onChange={(event) => setText(event.target.value)} placeholder={reason.placeholder} className="application-input mt-2 min-h-24 resize-none py-3" />
      </label> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="secondary-action">{cancelLabel}</button>
        <button type="button" disabled={!ready} onClick={() => onConfirm(text.trim())} className={cn(tone === "danger" ? "inline-flex min-h-11 items-center justify-center rounded-full bg-danger px-5 font-rounded text-sm font-bold text-on-danger transition hover:bg-danger-hover active:scale-[0.97] disabled:opacity-50" : "primary-action")}>{confirmLabel}</button>
      </div>
    </section>
  </div>;
}

/**
 * `const [dialog, confirm] = useConfirm()`, render `dialog`, then `const answer = await confirm({...})`:
 * false when dismissed, otherwise the reason ("" when the dialog does not ask for one).
 */
export function useConfirm() {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve: (answer: string | false) => void }) | null>(null);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<string | false>((resolve) => setOpen({ ...options, resolve })), []);
  const dialog = open ? <ConfirmDialog {...open} onConfirm={(text) => { open.resolve(text); setOpen(null); }} onCancel={() => { open.resolve(false); setOpen(null); }} /> : null;
  return [dialog, confirm] as const;
}
