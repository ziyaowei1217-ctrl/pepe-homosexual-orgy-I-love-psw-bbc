"use client";

import { Check, CircleAlert, Clock, Heart, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { RoommateCardFace, RoommateDetailPanel, RoommateMatchDialog } from "@/components/marketplace/roommate-card";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { ProductApiError } from "@/lib/product-errors";
import { getRoommateDeck, sendRoommateAction, undoRoommateAction, type RoommateAction, type RoommateCard, type RoommateDeckResponse } from "@/lib/roommate-matching";

const commitDistance = 110; // px
const commitVelocity = 0.6; // px per ms
const minFlick = 30; // px a fast flick must still travel
const flyMs = 220;
const refillBelow = 5;
const keyActions: Record<string, RoommateAction> = { ArrowLeft: "PASS", ArrowRight: "LIKE", ArrowDown: "LATER" };
const doneText: Record<RoommateAction, (name: string) => string> = {
  LIKE: (name) => `已喜欢 ${name}`,
  PASS: (name) => `已跳过 ${name}`,
  LATER: (name) => `已把 ${name} 放到稍后再看`
};
const smallButton = "grid size-11 place-items-center rounded-full bg-primary-soft text-primary-text hover:bg-primary-soft-hover active:scale-[0.97] disabled:opacity-40";

type Drag = { pointerId: number; startX: number; lastX: number; lastTime: number; velocity: number };

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/**
 * Optimistic swipe deck: a decision removes the card at once and the request runs in a serialized queue,
 * so undo always follows the action it reverts. A failed request puts the card back on top.
 */
export function RoommateSwipeDeck({ token, initial }: { token: string | null; initial: RoommateDeckResponse }) {
  const [cards, setCards] = useState(initial.items);
  const [history, setHistory] = useState<RoommateCard[]>([]);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState<RoommateAction | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean; undo?: boolean } | null>(null);
  const [match, setMatch] = useState<{ card: RoommateCard; conversationId: string } | null>(null);
  const drag = useRef<Drag | null>(null);
  const queue = useRef(Promise.resolve());
  const swiped = useRef(new Set<string>());
  const hasMore = useRef(initial.total > initial.items.length);
  const refilling = useRef(false);
  const undoing = useRef(false);
  const top = cards[0];
  const last = history.at(-1);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (cards.length >= refillBelow || !hasMore.current || refilling.current) return;
    refilling.current = true;
    // The deck has no cursor and guests' passes stay local, so ask for enough cards to get past them (API max 50).
    queue.current
      .then(() => getRoommateDeck(token, Math.min(50, swiped.current.size + 20)))
      .then((deck) => {
        setCards((current) => {
          const added = deck.items.filter((item) => !swiped.current.has(item.id) && !current.some((card) => card.id === item.id));
          hasMore.current = added.length > 0 && deck.total > deck.items.length;
          return [...current, ...added];
        });
      })
      .catch(() => { hasMore.current = false; })
      .finally(() => { refilling.current = false; });
  }, [cards.length, token]);

  function enqueue(task: () => Promise<void>) {
    queue.current = queue.current.then(task);
  }

  function restore(card: RoommateCard) {
    swiped.current.delete(card.id);
    // The card goes back on top, so a drag on the card below loses its pointerup; drop it.
    drag.current = null;
    setDragging(false);
    setOffset(0);
    setCards((current) => [card, ...current.filter((item) => item.id !== card.id)]);
  }

  function swipe(card: RoommateCard, action: RoommateAction) {
    swiped.current.add(card.id);
    setCards((current) => current.filter((item) => item.id !== card.id));
    setHistory((current) => [...current, card]);
    setToast({ text: doneText[action](card.name), undo: true });
    if (!token) return;
    enqueue(async () => {
      try {
        assertCurrentAuthSession(token);
        const result = await sendRoommateAction(token, card.id, action);
        if (result.conversation) setMatch({ card, conversationId: result.conversation.id });
      } catch (caught) {
        restore(card);
        setHistory((current) => current.filter((item) => item.id !== card.id));
        setToast({ text: caught instanceof Error ? caught.message : "操作没有完成，请重试。", error: true });
      }
    });
  }

  function decide(action: RoommateAction) {
    if (!top || leaving) return;
    if (!token && action !== "PASS") {
      setOffset(0);
      window.location.assign(authRoute({ returnTo: "/roommates", intent: "roommate-action" }));
      return;
    }
    const commit = () => { setLeaving(null); setOffset(0); swipe(top, action); };
    if (prefersReducedMotion()) return commit();
    setLeaving(action);
    window.setTimeout(commit, flyMs);
  }

  /** One undo at a time; the server always undoes the newest action. */
  function undo() {
    if (!last || leaving || undoing.current) return;
    const older = history.slice(0, -1);
    // Back in its place: after the older entries, before cards swiped since this press.
    const putBack = (current: RoommateCard[]) => {
      const at = current.findIndex((card) => !older.includes(card));
      return at < 0 ? [...current, last] : [...current.slice(0, at), last, ...current.slice(at)];
    };
    setHistory((current) => current.filter((card) => card !== last));
    setToast(null);
    if (!token) return restore(last);
    undoing.current = true;
    enqueue(async () => {
      try {
        // A failed swipe already put the card back; asking the server would undo the action before it.
        if (!swiped.current.has(last.id)) return;
        assertCurrentAuthSession(token);
        const undone = await undoRoommateAction(token);
        if (undone.roommateProfileId === last.id) {
          restore(last);
          setToast({ text: "已撤回" });
          return;
        }
        // A newer action from another page was undone, so this card's action is the newest again.
        setHistory(putBack);
        setToast({ text: "撤回的是在其他页面做的操作，刷新后可以看到。", error: true });
      } catch (caught) {
        // A refusal (matched, or over 10 minutes) holds for every older entry too; other errors can be retried.
        const refused = caught instanceof ProductApiError && caught.status === 409;
        setHistory(refused ? (current) => current.filter((card) => !older.includes(card)) : putBack);
        setToast({ text: caught instanceof Error ? caught.message : "撤回没有完成，请重试。", error: true });
      } finally {
        undoing.current = false;
      }
    });
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.isPrimary === false || event.button !== 0 || leaving || (event.target as Element).closest("button, a")) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const elapsed = event.timeStamp - current.lastTime;
    if (elapsed > 0) current.velocity = (event.clientX - current.lastX) / elapsed;
    current.lastX = event.clientX;
    current.lastTime = event.timeStamp;
    setOffset(event.clientX - current.startX);
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    const dx = current.lastX - current.startX;
    const velocity = event.timeStamp - current.lastTime < 100 ? current.velocity : 0;
    const flick = Math.abs(velocity) > commitVelocity && Math.abs(dx) > minFlick && Math.sign(velocity) === Math.sign(dx);
    const direction = Math.abs(dx) > commitDistance ? dx : flick ? velocity : 0;
    if (event.type === "pointercancel" || !direction) setOffset(0);
    else decide(direction > 0 ? "LIKE" : "PASS");
  }

  function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const action = keyActions[event.key];
    if (action) decide(action);
    else if (event.key === "Backspace" || event.key === "z") undo();
    else return;
    event.preventDefault();
  }

  function cardStyle(index: number): CSSProperties {
    const transition = `transform ${flyMs}ms ease-out, opacity ${flyMs}ms ease-out`;
    if (index > 0) return { zIndex: 3 - index, opacity: 1 - index * 0.3, transform: `translateY(${index * 10}px) scale(${1 - index * 0.04})`, transformOrigin: "bottom", transition };
    if (leaving) {
      const direction = { LIKE: 1, PASS: -1, LATER: 0 }[leaving];
      return { zIndex: 3, opacity: 0, transition, transform: direction ? `translateX(${direction * 130}%) rotate(${direction * 15}deg)` : "translateY(40px) scale(0.92)" };
    }
    return { zIndex: 3, transform: `translateX(${offset}px) rotate(${offset / 18}deg)`, transition: dragging || prefersReducedMotion() ? "none" : transition };
  }

  const stamp = (action: "LIKE" | "PASS") => leaving === action ? 1 : Math.min(Math.max((action === "LIKE" ? offset : -offset) / commitDistance, 0), 1);
  const undoButton = last ? `撤回 ${last.name}` : "撤回";
  const editProfile = initial.filteredOut > 0 || Boolean(token && !initial.viewer.hasProfile);
  const emptyBody = initial.filteredOut > 0
    ? `有 ${initial.filteredOut} 位因入住时间、预算或偏好不合适没有显示，可以在室友资料里放宽条件。`
    : token && !initial.viewer.hasProfile ? "填写室友资料后，会按双向匹配度推荐室友。" : "新的室友资料出现后会显示在这里。";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {top ? (
        <div role="region" tabIndex={0} aria-label="室友卡片，左右方向键跳过或喜欢" onKeyDown={keyDown} className="mx-auto w-full max-w-[440px] rounded-psw-xl">
          <div className="relative mb-8 select-none">
            {cards.slice(0, 3).map((card, index) => index === 0 ? (
              <div key={card.id} style={cardStyle(0)} className="relative touch-pan-y" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerEnd}>
                <RoommateCardFace card={card} priority>
                  <span aria-hidden="true" style={{ opacity: stamp("LIKE") }} className="absolute left-5 top-16 -rotate-12 rounded-psw-lg bg-primary px-4 py-1 font-rounded text-m-title text-on-primary">喜欢</span>
                  <span aria-hidden="true" style={{ opacity: stamp("PASS") }} className="absolute right-5 top-16 rotate-12 rounded-psw-lg bg-ink-block px-4 py-1 font-rounded text-m-title text-on-dark">跳过</span>
                </RoommateCardFace>
              </div>
            ) : (
              <div key={card.id} aria-hidden="true" style={cardStyle(index)} className="absolute inset-0 overflow-hidden rounded-psw-xl">
                <RoommateCardFace card={card} />
              </div>
            ))}
          </div>
          {/* Phones: pinned above the tab bar on a band of page colour, so a long card scrolls under the buttons instead of
              colliding with them. */}
          <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex items-center justify-center gap-4 bg-gradient-to-t from-background from-60% to-transparent px-4 pb-2 pt-5 md:bottom-6 md:mx-0 md:bg-none md:p-0 lg:static">
            <button type="button" onClick={undo} disabled={!last} aria-label={undoButton} className={smallButton}><Undo2 className="size-5" aria-hidden="true" /></button>
            <button type="button" onClick={() => decide("PASS")} aria-label={`跳过 ${top.name}`} className="grid size-14 place-items-center rounded-full border-[1.5px] border-outline bg-surface text-ink hover:border-control-border active:scale-[0.97]"><X className="size-6" aria-hidden="true" /></button>
            <button type="button" onClick={() => decide("LATER")} aria-label={`稍后再看 ${top.name}`} className={smallButton}><Clock className="size-5" aria-hidden="true" /></button>
            <button type="button" onClick={() => decide("LIKE")} aria-label={`喜欢 ${top.name}`} className="grid size-14 place-items-center rounded-full bg-primary text-on-primary hover:bg-primary-hover active:scale-[0.97]"><Heart className="size-6" fill="currentColor" aria-hidden="true" /></button>
          </div>
        </div>
      ) : match ? null : (
        <EmptyState className="lg:col-span-2" mood="sleepy" title="暂时没有新的推荐" body={emptyBody}
          action={last || editProfile ? <div className="flex flex-wrap justify-center gap-2">
            {last ? <button type="button" onClick={undo} className="secondary-action"><Undo2 className="size-4" aria-hidden="true" />{undoButton}</button> : null}
            {editProfile ? <Link href="/roommates/me" className="secondary-action">编辑室友资料</Link> : null}
          </div> : null} />
      )}
      {top ? <RoommateDetailPanel card={top} /> : null}
      {toast ? (
        <div role="status" className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] left-1/2 z-[70] flex w-max max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-psw-md bg-toast-bg px-5 py-3 text-m-subhead text-on-toast shadow-menu sm:text-d-subhead md:bottom-24 lg:bottom-8">
          {toast.error ? <CircleAlert className="size-4 shrink-0 text-toast-danger" aria-hidden="true" /> : <Check className="size-4 shrink-0 text-toast-success" aria-hidden="true" />}
          <span className="min-w-0">{toast.text}</span>
          {toast.undo ? <button type="button" onClick={undo} className="tap-target shrink-0 font-semibold text-toast-action underline">撤回</button> : null}
        </div>
      ) : null}
      {match ? <RoommateMatchDialog name={match.card.name} icebreaker={match.card.icebreaker} conversationId={match.conversationId} onClose={() => setMatch(null)} /> : null}
    </div>
  );
}
