"use client";

import { Check, Copy, Send, Square, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { ListingCard } from "@/components/marketplace/listing-card";
import { useSavedListings } from "@/components/marketplace/saved-listings-provider";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { authRoute, dmRouteForTarget } from "@/lib/app-routes";
import {
  askAssistant,
  clearAssistantConversation,
  setPendingDraft,
  stopAssistant,
  useAssistantConversation,
  type AssistantAnswer
} from "@/lib/assistant/client";
import { assistantLimits, type AssistantDraftEvent, type AssistantListingsEvent } from "@/lib/assistant/protocol";
import { listingHref } from "@/lib/listing-stay";

/** What the page tells the assistant: the listing being viewed, the dates in the URL and the saved listings. */
function pageContext(savedIds: ReadonlySet<string>) {
  const params = new URLSearchParams(window.location.search);
  const listingId = /^\/listing\/([^/?#]+)/.exec(window.location.pathname)?.[1];
  return {
    listingId: listingId ? decodeURIComponent(listingId) : undefined,
    savedListingIds: [...savedIds].slice(0, assistantLimits.savedListings),
    moveIn: params.get("moveIn") ?? undefined,
    moveOut: params.get("moveOut") ?? undefined
  };
}

/** One line for screen readers about the latest answer; the answer itself stays in the log. */
function announcement(answer: AssistantAnswer | undefined) {
  if (!answer) return "";
  if (answer.pending) return answer.status ?? "正在思考…";
  if (answer.error) return "回答失败";
  const cards = answer.listings.reduce((count, event) => count + event.listings.length, 0);
  return `已回答${cards ? `，附 ${cards} 套房源` : ""}${answer.drafts.length ? "，附消息草稿" : ""}`;
}

export function AssistantPanel({ token, onClose }: { token: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Follow new text only while the reader is at the bottom of the log.
  const stick = useRef(true);
  const { savedIds, toggleSaved } = useSavedListings();
  const { items, running } = useAssistantConversation(token);
  const [question, setQuestion] = useState("");
  useModalFocus(dialog, onClose);
  // After the hook's own first-element focus: start in the composer, not on 「清空」.
  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    if (log.current && stick.current) log.current.scrollTop = log.current.scrollHeight;
  }, [items]);

  function ask(text: string) {
    if (!token || !text.trim()) return;
    setQuestion("");
    stick.current = true;
    void askAssistant(token, text.trim(), pageContext(savedIds));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (running) stopAssistant();
    else ask(question);
  }

  return (
    // marketplace-shell: the panel is portaled out of the shell, and its reduced-motion rules should still apply.
    <div className="marketplace-shell marketplace-modal-backdrop fixed inset-0 z-[80] flex justify-end bg-ink-block/40 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="assistant-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="marketplace-modal-panel flex h-dvh w-full flex-col bg-surface shadow-dialog sm:m-3 sm:h-[calc(100dvh-24px)] sm:max-w-[440px] sm:rounded-psw-xl"
      >
        <header className="flex items-start gap-2 border-b border-line-strong py-3 pl-4 pr-2 sm:pl-5">
          <div className="min-w-0 flex-1 pt-1">
            <h2 id="assistant-title" className="text-m-title sm:text-d-title">AI 助手</h2>
            <p className="mt-0.5 text-m-footnote text-ink-secondary">可以帮你找房、比较房源、起草给房东的消息。消息由你自己发送。</p>
          </div>
          {items.length ? <button type="button" onClick={() => { clearAssistantConversation(); input.current?.focus(); }} className="min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-subtle">清空</button> : null}
          <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-surface-subtle" aria-label="关闭 AI 助手"><X className="size-5" aria-hidden="true" /></button>
        </header>

        <p role="status" className="sr-only">{announcement(items.at(-1)?.role === "assistant" ? (items.at(-1) as AssistantAnswer) : undefined)}</p>
        <div
          ref={log}
          onScroll={(event) => {
            const element = event.currentTarget;
            stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          }}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5"
        >
          {!token ? (
            <div className="rounded-psw-lg bg-surface-muted p-6 text-center">
              <p className="text-d-label">登录后使用 AI 助手</p>
              <Link href={authRoute({ returnTo: `${window.location.pathname}${window.location.search}` })} onClick={onClose} className="primary-action mt-4">登录</Link>
            </div>
          ) : items.length === 0 ? (
            <Suggestions onAsk={ask} hasSaved={savedIds.size > 0} />
          ) : (
            items.map((item) =>
              item.role === "user" ? (
                <p key={item.id} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-[20px] rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-6 text-white [overflow-wrap:anywhere]"><span className="sr-only">你：</span>{item.text}</p>
              ) : (
                <Answer key={item.id} answer={item} token={token} savedIds={savedIds} onToggleSave={toggleSaved} onLeave={onClose} />
              )
            )
          )}
        </div>

        {token ? (
          <form onSubmit={submit} className="shrink-0 border-t border-line-strong p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="flex items-end gap-2 rounded-[22px] border border-line-strong bg-surface-muted p-2 pl-4 focus-within:border-primary">
              <textarea
                ref={input}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  // Enter that confirms a pinyin candidate must not send (Safari reports it as keyCode 229).
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                    event.preventDefault();
                    if (!running) ask(question);
                  }
                }}
                rows={2}
                maxLength={assistantLimits.messageChars}
                placeholder="输入问题…"
                aria-label="问 AI 助手"
                className="min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-base outline-none focus-visible:shadow-none focus-visible:outline-none sm:text-sm"
              />
              <button
                type="submit"
                disabled={!running && !question.trim()}
                aria-label={running ? "停止回答" : "发送"}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-white transition active:scale-[0.97] hover:bg-primary-hover disabled:opacity-40"
              >
                {running ? <Square className="size-4 fill-current" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              </button>
            </div>
            <p className="mt-2 text-center text-m-footnote text-ink-secondary">AI 可能出错，房源信息以详情页为准。</p>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function Suggestions({ onAsk, hasSaved }: { onAsk: (text: string) => void; hasSaved: boolean }) {
  const onListing = window.location.pathname.startsWith("/listing/");
  const prompts = onListing
    ? ["这套房按我的日期总价多少？", ...(hasSaved ? ["这套房和我收藏的比怎么样？"] : []), "帮我给这位房东写一条消息"]
    : ["找 6 月到 8 月、每月 $1,500 以下的房间", ...(hasSaved ? ["比较我收藏的房源"] : []), "帮我写一条消息，问房东能不能看房"];
  return (
    <div>
      <p className="text-d-label">可以这样问：</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {prompts.map((prompt) => <button key={prompt} type="button" onClick={() => onAsk(prompt)} className="search-pill whitespace-normal text-left">{prompt}</button>)}
      </div>
    </div>
  );
}

function Answer({ answer, token, savedIds, onToggleSave, onLeave }: {
  answer: AssistantAnswer; token: string; savedIds: ReadonlySet<string>; onToggleSave: (id: string) => void; onLeave: () => void;
}) {
  return (
    <div className="space-y-3">
      {answer.text ? <p className="w-fit max-w-[92%] whitespace-pre-wrap rounded-[20px] rounded-bl-md bg-tag-neutral px-4 py-2.5 text-[15px] leading-6 text-ink [overflow-wrap:anywhere]"><span className="sr-only">AI 助手：</span>{answer.text}</p> : null}
      {answer.listings.map((event, index) => <ListingResults key={index} event={event} savedIds={savedIds} onToggleSave={onToggleSave} onLeave={onLeave} />)}
      {answer.drafts.map((draft, index) => <DraftCard key={index} draft={draft} token={token} onLeave={onLeave} />)}
      {answer.pending ? <p className="flex items-center gap-2 text-m-footnote text-ink-secondary" aria-hidden="true"><span className="size-2 animate-pulse rounded-full bg-primary" />{answer.status ?? "正在思考…"}</p> : null}
      {answer.error ? <p role="alert" className="rounded-psw-md bg-danger-soft p-3 text-m-subhead font-semibold text-danger-text">{answer.error}</p> : null}
    </div>
  );
}

function ListingResults({ event, savedIds, onToggleSave, onLeave }: {
  event: AssistantListingsEvent; savedIds: ReadonlySet<string>; onToggleSave: (id: string) => void; onLeave: () => void;
}) {
  const stay = { moveIn: event.moveIn ?? "", moveOut: event.moveOut ?? "" };
  if (!event.listings.length) return null;
  return (
    <div>
      <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 py-1 sm:-mx-5 sm:scroll-px-5 sm:px-5">
        {event.listings.map((listing) => (
          <ListingCard
            key={listing.id}
            listing={listing}
            href={listingHref(listing.id, stay)}
            {...stay}
            saved={savedIds.has(listing.id)}
            onToggleSave={() => onToggleSave(listing.id)}
            onOpen={onLeave}
            sizes="232px"
            className="w-[232px] shrink-0 snap-start border border-line-strong"
          />
        ))}
      </div>
      {event.searchUrl && event.total && event.total > event.listings.length ? (
        <Link href={event.searchUrl} onClick={onLeave} className="mt-1 inline-flex min-h-11 items-center text-m-subhead font-semibold text-primary-text hover:underline">在找房页查看全部 {event.total} 套</Link>
      ) : null}
    </div>
  );
}

function DraftCard({ draft, token, onLeave }: { draft: AssistantDraftEvent; token: string; onLeave: () => void }) {
  const router = useRouter();
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <section className="rounded-psw-xl border border-line-strong p-4" aria-label="给房东的消息草稿">
      <h3 className="text-m-headline">给房东的消息草稿 · <span className="font-sans font-semibold">{draft.listingTitle}</span></h3>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-6 text-ink [overflow-wrap:anywhere]">{draft.body}</p>
      <p className="mt-2 text-m-footnote text-ink-secondary">发送前可以修改。</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="primary-action"
          onClick={() => {
            setPendingDraft({ token, listingId: draft.listingId, body: draft.body });
            onLeave();
            router.push(dmRouteForTarget({ kind: "listing", id: draft.listingId }));
          }}
        >
          <Send className="size-4" aria-hidden="true" />去发送
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => {
            const done = (state: "copied" | "failed") => {
              setCopy(state);
              window.setTimeout(() => setCopy("idle"), 2000);
            };
            if (!navigator.clipboard) done("failed");
            else navigator.clipboard.writeText(draft.body).then(() => done("copied"), () => done("failed"));
          }}
        >
          {copy === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copy === "copied" ? "已复制" : "复制"}
        </button>
      </div>
      {copy === "failed" ? <p role="alert" className="mt-2 text-m-footnote font-semibold text-danger-text">复制失败，请长按文字复制。</p> : null}
    </section>
  );
}
