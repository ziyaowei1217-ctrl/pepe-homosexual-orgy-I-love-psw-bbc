"use client";

import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { requestListingCopy, useAssistantEnabled } from "@/lib/assistant/client";
import { assistantLimits } from "@/lib/assistant/protocol";
import { toProductApiError } from "@/lib/product-errors";
import type { PublishDraft } from "@/lib/publish-listing";

/** 「AI 帮我写」 in the host form: turns a few sentences into the title, commute, transit and amenity fields. */
export function ListingCopyHelper({ token, draft, onApply }: { token: string; draft: PublishDraft; onApply: (patch: Partial<PublishDraft>) => void }) {
  const enabled = useAssistantEnabled(Boolean(token));
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);
  const request = useRef<AbortController | null>(null);
  const notesInput = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => request.current?.abort(), []);
  // The button that opened the form is gone; keep keyboard focus in the form.
  useEffect(() => {
    if (open) notesInput.current?.focus();
  }, [open]);
  if (!enabled) return null;

  async function fill() {
    request.current?.abort();
    const controller = (request.current = new AbortController());
    const count = (value: number) => Math.max(0, Math.round(value || 0));
    setPending(true);
    setResult(null);
    try {
      const copy = await requestListingCopy(token, {
        notes: notes.trim(),
        draft: {
          title: draft.title, area: draft.area, availableFrom: draft.availableFrom, availableTo: draft.availableTo,
          beds: count(draft.beds), baths: count(draft.baths), price: count(draft.price),
          commute: draft.commute, transit: draft.transit, tags: draft.tags
        }
      }, controller.signal);
      const patch: Partial<PublishDraft> = {};
      if (copy.title) patch.title = copy.title;
      if (copy.commute) patch.commute = copy.commute;
      if (copy.transit) patch.transit = copy.transit;
      const newTags = copy.tags.filter((tag) => !draft.tags.includes(tag));
      if (newTags.length) patch.tags = [...draft.tags, ...newTags];
      const filled = [patch.title && "标题", patch.commute && "通勤", patch.transit && "交通", patch.tags && "设施"].filter(Boolean);
      if (!filled.length) {
        setResult({ text: "描述里没有可用的信息，请补充后再试。", error: true });
        return;
      }
      onApply(patch);
      setResult({ text: `已填入${filled.join("、")}${patch.tags ? "（设施在「价格与设施」一步）" : ""}，请核对后再保存。`, error: false });
    } catch (error) {
      if (!controller.signal.aborted) setResult({ text: toProductApiError(error).message, error: true });
    } finally {
      if (request.current === controller) setPending(false);
    }
  }

  return (
    <div className="rounded-psw-lg bg-surface-muted p-4 md:col-span-2">
      {open ? (
        <div className="grid gap-3">
          <label className="grid gap-2 text-d-label">
            用几句话描述房间
            <textarea
              ref={notesInput}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={assistantLimits.notesChars}
              placeholder="例如：主卧，带家具，步行 10 分钟到 UCLA，近地铁，可养猫"
              className="application-input h-auto resize-y py-3 font-normal"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void fill()} disabled={pending || !notes.trim()} className="primary-action">
              <Sparkles className="size-4" aria-hidden="true" />{pending ? "正在填写…" : "填入表单"}
            </button>
            <p role="status" className="text-m-subhead text-ink-secondary">{result && !result.error ? result.text : ""}</p>
            {result?.error ? <p role="alert" className="text-m-subhead font-semibold text-danger-text">{result.text}</p> : null}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setOpen(true)} className="secondary-action">
            <Sparkles className="size-4" aria-hidden="true" />AI 帮我写
          </button>
          <p className="text-m-subhead text-ink-secondary">用几句话描述房间，AI 帮你填写标题、通勤、交通和设施。</p>
        </div>
      )}
    </div>
  );
}
