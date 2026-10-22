"use client";

import { CalendarDays, Check, CircleAlert, MapPin, Wallet } from "lucide-react";
import Link from "next/link";
import { useId, useRef, type ReactNode } from "react";

import { Wowo } from "@/components/brand/wowo";
import { useModalFocus } from "@/components/marketplace/use-modal-focus";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { formatRoommateBudget, formatStay, roommateLabel, tierLabels, type RoommateCard } from "@/lib/roommate-matching";

const photoChip = "rounded-psw-sm px-2.5 py-1 text-m-footnote font-semibold";
const subheading = "text-m-label text-ink-secondary sm:text-d-label";

/** Digits and $ in the display face; CJK units stay in the body face (the display face's CJK fallback is bold only). */
function numeric(text: string | null) {
  return text?.split(/([\u4e00-\u9fff]+)/).map((part, index) => (index % 2 || !part ? part : <span key={index} className="font-display">{part}</span>)) ?? null;
}

/** The photo with its labels. Children draw on top of it (the deck's swipe stamps). */
export function RoommatePhoto({ card, priority = false, className = "", children }: {
  card: RoommateCard; priority?: boolean; className?: string; children?: ReactNode;
}) {
  return (
    <div className={`relative aspect-[3/4] overflow-hidden bg-primary-soft ${className}`}>
      <SmartImage src={card.image} alt={card.name} fill priority={priority} draggable={false} sizes="(max-width: 1024px) 100vw, 440px" className="object-cover" />
      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
        {card.tier ? <span className={`${photoChip} bg-photo-button text-ink`}><span className="font-display">{card.score}%</span> · {tierLabels[card.tier]}</span> : null}
        {card.likedYou ? <span className={`${photoChip} bg-primary text-on-primary`}>TA 喜欢了你</span> : null}
        {card.later ? <span className={`${photoChip} bg-photo-button text-ink`}>稍后再看</span> : null}
      </div>
      {children}
    </div>
  );
}

export function RoommateCardFace({ card, priority, children }: { card: RoommateCard; priority?: boolean; children?: ReactNode }) {
  const facts = [
    { icon: CalendarDays, label: "入住时间", value: numeric(formatStay(card.moveInDate, card.moveOutDate)) },
    { icon: Wallet, label: "预算", value: numeric(formatRoommateBudget(card.budgetMin, card.budgetMax)) },
    { icon: MapPin, label: "区域", value: card.neighborhoods.slice(0, 2).join("、") || card.city }
  ].filter((fact) => fact.value);
  return (
    <article className="overflow-hidden rounded-psw-xl bg-surface">
      {/* Capped so the name and the deck's buttons stay near the first screen. */}
      <RoommatePhoto card={card} priority={priority} className="max-h-[50dvh] lg:max-h-[calc(100dvh-26rem)]">{children}</RoommatePhoto>
      <div className="p-4 sm:p-5">
        <h2 className="text-m-title sm:text-d-title">{card.name}<span className="font-display">, {card.age}</span></h2>
        {card.school ? <p className="mt-0.5 text-m-subhead text-ink-secondary sm:text-d-subhead">{card.school}</p> : null}
        {facts.length ? (
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {facts.map(({ icon: Icon, label, value }) => (
              <li key={label} className="flex items-center gap-1.5 text-m-subhead text-ink sm:text-d-subhead">
                <Icon className="size-4 shrink-0 text-ink-secondary" aria-hidden="true" /><span className="sr-only">{label}</span>{value}
              </li>
            ))}
          </ul>
        ) : null}
        <NoteList items={card.reasons.slice(0, 2)} className="mt-3" />
      </div>
    </article>
  );
}

export function RoommateDetailPanel({ card }: { card: RoommateCard }) {
  const titleId = useId();
  const facts: Array<[string, ReactNode]> = [
    ["入住时间", numeric(formatStay(card.moveInDate, card.moveOutDate))],
    ["预算", numeric(formatRoommateBudget(card.budgetMin, card.budgetMax))],
    ["城市", card.city],
    ["想住的区域", card.neighborhoods.join("、")],
    ["房型", roommateLabel("roomType", card.roomType)],
    ["性别", roommateLabel("gender", card.gender)],
    ["作息", roommateLabel("sleepSchedule", card.sleepSchedule)],
    ["整洁", roommateLabel("cleanliness", card.cleanliness)],
    ["带朋友", roommateLabel("guests", card.guests)],
    ["吸烟", roommateLabel("smoking", card.smoking)],
    ["宠物", roommateLabel("pets", card.pets)]
  ];
  const knownFacts = facts.filter(([, value]) => value);
  return (
    <section aria-labelledby={titleId} className="rounded-psw-xl bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="text-m-headline sm:text-d-headline">匹配详情</h2>
        {card.tier ? <div className="flex items-center gap-2"><span className="font-display text-m-price text-ink sm:text-d-price-large">{card.score}%</span><Badge className="text-[13px] leading-5">{tierLabels[card.tier]}</Badge></div> : null}
      </div>
      {card.tier ? null : <p className="mt-2 text-m-subhead text-ink-secondary sm:text-d-subhead">{card.watchouts.length ? "条件有冲突，不会互相推荐。" : "填写室友资料后显示双向匹配度。"}</p>}
      <NoteList items={card.reasons} className="mt-4" />
      <NoteList items={card.watchouts} watch className="mt-2" />
      {card.breakdown.length ? (
        <div className="mt-6">
          <h3 className={subheading}>各项匹配度</h3>
          <ul className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {card.breakdown.map((item) => (
              <li key={item.key}>
                <div className="flex justify-between text-m-footnote sm:text-d-footnote"><span className="text-ink-secondary">{item.label}</span><span className="font-display font-semibold text-ink">{item.score}</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-soft" aria-hidden="true"><div className="h-full rounded-full bg-primary" style={{ width: `${item.score}%` }} /></div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {knownFacts.length ? (
        <div className="mt-6">
          <h3 className={subheading}>基本情况</h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
            {knownFacts.map(([label, value]) => <div key={label}><dt className="text-m-footnote text-ink-secondary sm:text-d-footnote">{label}</dt><dd className="text-m-subhead text-ink sm:text-d-subhead">{value}</dd></div>)}
          </dl>
        </div>
      ) : null}
      {[["自我介绍", card.intro], ["想找的室友", card.lookingFor]].map(([title, text]) => text ? (
        <div key={title} className="mt-6"><h3 className={subheading}>{title}</h3><p className="mt-2 whitespace-pre-line text-m-body text-ink sm:text-d-body">{text}</p></div>
      ) : null)}
      {card.icebreaker ? <p className="mt-6 rounded-psw-lg bg-primary-soft p-4 text-m-subhead text-on-primary-soft sm:text-d-subhead">{card.icebreaker}</p> : null}
    </section>
  );
}

function NoteList({ items, watch = false, className }: { items: string[]; watch?: boolean; className: string }) {
  if (!items.length) return null;
  const Icon = watch ? CircleAlert : Check;
  return (
    <ul className={`space-y-1.5 ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-m-subhead text-ink sm:text-d-subhead">
          <Icon className={`mt-1 size-4 shrink-0 ${watch ? "text-warning-text" : "text-primary-text"}`} aria-hidden="true" />
          {watch ? <span className="sr-only">需要注意：</span> : null}{item}
        </li>
      ))}
    </ul>
  );
}

export function RoommateMatchDialog({ name, icebreaker, conversationId, onClose }: {
  name: string; icebreaker: string | null; conversationId: string; onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalFocus(dialog, onClose);
  return (
    <div className="marketplace-modal-backdrop fixed inset-0 z-[80] grid place-items-center bg-ink-block/35 p-4 backdrop-blur-sm" role="presentation" onMouseDown={onClose}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()} className="marketplace-modal-panel w-full max-w-sm rounded-psw-2xl bg-surface p-6 text-center shadow-dialog">
        <Wowo mood="happy" size={96} className="mx-auto block" />
        <h2 id={titleId} className="mt-4 text-m-title sm:text-d-title">你和 {name} 互相喜欢了</h2>
        {icebreaker ? <p className="mt-2 text-m-subhead text-ink-secondary sm:text-d-subhead">{icebreaker}</p> : null}
        <div className="mt-6 grid gap-2">
          <Link href={`/inbox/${encodeURIComponent(conversationId)}`} className="primary-action">发消息</Link>
          <button type="button" onClick={onClose} className="secondary-action">继续看看</button>
        </div>
      </div>
    </div>
  );
}
