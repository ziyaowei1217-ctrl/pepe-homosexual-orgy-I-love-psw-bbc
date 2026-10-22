"use client";

import { ArrowLeft, Check, ChevronRight, Heart, MessageCircle, Settings2, Sparkles, UsersRound, X } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";
import { apiGet, apiPost } from "@/lib/api";
import type { ApiRoommate, ApiRoommateActionResponse, ApiRoommateActivity, ApiRoommateDeckResponse } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { getRoommateActionTargetId } from "@/lib/roommate-deck-client";
import { cn } from "@/lib/utils";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";

export function RoommatesExperience() {
  const token = useAuthSessionToken();
  return <RoommatesSessionExperience key={token ?? "guest"} token={token} />;
}

function RoommatesSessionExperience({ token }: { token: string | null }) {
  const [roommates, setRoommates] = useState<ApiRoommate[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const active = roommates[index] ?? null;

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && (readStoredAuthSession()?.accessToken ?? null) === token;
    apiGet<ApiRoommateDeckResponse>("/roommates/deck?limit=24", token ?? undefined)
      .then((deck) => { if (isCurrent()) { setRoommates(deck.items); setLoadFailed(false); } })
      .catch((caught) => { if (isCurrent()) { setError(caught instanceof Error ? caught.message : "室友推荐暂时无法加载。"); setLoadFailed(true); } })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, loadAttempt]);

  function retryLoad() {
    setError(null);
    setLoading(true);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function decide(action: "LIKE" | "PASS") {
    const actionTargetId = active ? getRoommateActionTargetId(active) : undefined;
    if (!actionTargetId || pending) return;
    if (!token) {
      window.location.assign(authRoute({ returnTo: "/roommates", intent: "roommate-action" }));
      return;
    }
    setPending(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const result = await apiPost<ApiRoommateActionResponse>(`/roommates/${encodeURIComponent(actionTargetId)}/actions`, { action }, token);
      assertCurrentAuthSession(token);
      setRoommates((current) => current.filter((item) => getRoommateActionTargetId(item) !== actionTargetId));
      setIndex(0);
      if (result.conversation) window.location.assign(`/inbox/${encodeURIComponent(result.conversation.id)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败，请重试。");
    } finally { setPending(false); }
  }

  return <main className="min-h-[calc(100dvh-72px)] bg-surface-subtle">
    <div className="page-container pt-8 sm:pt-12"><PageHeader title="找到合拍的室友" description="浏览室友资料，互相喜欢后就能开始聊天。" action={<><Link href="/roommates/likes" className="secondary-action"><Heart className="size-4" aria-hidden="true" />喜欢列表</Link><Link href="/account/profile" className="secondary-action" aria-label="编辑个人资料"><Settings2 className="size-4" aria-hidden="true" /></Link></>} /></div>
    <div className="page-container grid gap-6 pb-16 pt-6 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside aria-label="你的个人资料" className="order-last h-fit rounded-psw-xl bg-surface p-5 lg:order-first"><h2 className="text-m-headline sm:text-d-headline">让室友认识你</h2><p className="mt-2 text-m-subhead text-ink-secondary sm:text-d-subhead">补充城市、学校和个人简介，方便彼此了解。</p><Link href="/account/profile" className="mt-3 inline-flex min-h-11 items-center gap-1 font-rounded text-d-label text-primary-text hover:text-ink">编辑资料<ChevronRight className="size-4" aria-hidden="true" /></Link></aside>
      <section className="min-w-0">
        <p className="sr-only">为什么适合你</p>
        {loading ? <StatusCard text="正在加载室友推荐…" /> : null}
        {error ? (loadFailed ? <EmptyState className="mt-6" mood="sorry" title="室友推荐没加载出来" body={<span role="alert">{error}</span>} action={<button type="button" onClick={retryLoad} className="primary-action">重试</button>} /> : <StatusCard text={error} error />) : null}
        {!loading && !error && !active ? <EmptyState className="mt-6" mood="sleepy" title="暂时没有新的推荐" body="新的室友资料出现后会在这里显示，晚点再来看看。" /> : null}
        {active ? <article className="overflow-hidden rounded-psw-2xl border border-line-strong bg-surface shadow-dialog"><div className="relative h-[240px] bg-tag-neutral sm:h-[420px] lg:h-[560px]"><SmartImage src={active.image} alt={active.name} fill priority sizes="(max-width:1024px) 100vw, 65vw" className="object-cover object-[50%_20%]" /><div className="absolute inset-0 bg-gradient-to-t from-ink-block/80 via-transparent to-transparent" /><div className="absolute left-5 top-5 rounded-full bg-surface px-3 py-1.5 text-m-footnote font-bold text-primary-text">{active.compatibilityScore ?? active.match}% 匹配</div><div className="absolute inset-x-6 bottom-6 text-white"><h2 className="font-rounded text-m-large-title font-bold">{active.name}, {active.age}</h2><p className="mt-2 text-sm text-on-dark-secondary">{active.role}</p></div></div><div className="grid gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-2"><div><p className="text-m-footnote font-bold text-ink-placeholder">预算与地点</p><p className="mt-2 text-sm font-bold">{active.budget} · {active.commute}</p><div className="mt-4 flex flex-wrap gap-2">{active.tags.map((tag) => <span key={tag} className="rounded-full bg-tag-neutral px-3 py-1.5 text-m-footnote font-bold text-ink-secondary">{tag}</span>)}</div></div><div className="hidden rounded-psw-xl bg-surface-subtle p-5 md:block"><h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4 text-primary-text" />为什么适合你</h3><ul className="mt-4 space-y-2">{(active.reasons ?? active.recommendation?.primarySignals ?? []).map((reason) => <li key={reason} className="flex gap-2 text-m-footnote text-ink"><Check className="size-3.5 shrink-0" />{reason}</li>)}</ul></div><details className="rounded-psw-lg bg-surface-subtle p-4 md:hidden"><summary className="cursor-pointer text-sm font-bold text-ink">为什么适合你</summary><ul className="mt-3 space-y-2">{(active.reasons ?? active.recommendation?.primarySignals ?? []).map((reason) => <li key={reason} className="flex gap-2 text-m-footnote leading-5 text-ink"><Check className="mt-0.5 size-3.5 shrink-0" />{reason}</li>)}</ul></details></div><div className="flex justify-center gap-2 border-t border-line-strong p-4 sm:gap-4 sm:p-5"><button disabled={pending} onClick={() => void decide("PASS")} className="grid size-14 place-items-center rounded-full border border-line-strong" aria-label={`跳过 ${active.name}`}><X className="size-5" /></button><button disabled={pending} onClick={() => void decide("LIKE")} className="primary-action px-4 sm:px-8"><Heart className="size-5" />感兴趣</button>{active.id ? <Link href={`/roommates/${encodeURIComponent(active.id)}`} className="secondary-action">查看资料</Link> : null}</div></article> : null}
      </section>
    </div>
  </main>;
}

export function RoommateLikesExperience() {
  const token = useAuthSessionToken();
  return <RoommateLikesSessionExperience key={token ?? "guest"} token={token} />;
}

function RoommateLikesSessionExperience({ token }: { token: string | null }) {
  const [tab, setTab] = useState<"inbound" | "outbound" | "matched">("inbound");
  const [activity, setActivity] = useState<ApiRoommateActivity | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  async function likeBack(profile: ApiRoommate) {
    const actionTargetId = getRoommateActionTargetId(profile);
    if (!token || !actionTargetId || likingId) return;
    setLikingId(actionTargetId);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      await apiPost<ApiRoommateActionResponse>(`/roommates/${encodeURIComponent(actionTargetId)}/actions`, { action: "LIKE" }, token);
      assertCurrentAuthSession(token);
      setReloadKey((key) => key + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "回应失败，请稍后再试。");
    } finally {
      setLikingId(null);
    }
  }

  useEffect(() => {
    if (!token) return;
    setAuthenticated(true);
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    apiGet<ApiRoommateActivity>("/roommates/activity", token)
      .then((next) => { if (isCurrent()) setActivity(next); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "喜欢列表暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [reloadKey, token]);

  const items = useMemo(() => {
    if (!activity) return [];
    if (tab === "inbound") return activity.inbound.map((item) => item.profile);
    if (tab === "outbound") return activity.outbound.map((item) => item.profile);
    return activity.outbound.map((item) => item.profile).filter((profile) => profile.id && activity.matchedProfileIds.includes(profile.id));
  }, [activity, tab]);

  return <main className="min-h-[calc(100dvh-72px)] bg-background"><div className="page-container pb-16 pt-6 sm:pt-10"><Link href="/roommates" className="-ml-3 mb-2 flex min-h-11 w-fit items-center gap-1 rounded-full px-3 text-[15px] font-bold text-ink-secondary hover:bg-surface-subtle sm:text-sm"><ArrowLeft className="size-4" aria-hidden="true" />返回匹配</Link><PageHeader title="喜欢与匹配" description="单向的喜欢和双方都喜欢的匹配分开显示。" action={<Link href="/roommates/teams" className="secondary-action"><UsersRound className="size-4" aria-hidden="true" />合租小组</Link>} /><div className="mt-7 flex gap-2">{[["inbound","喜欢我的"],["outbound","我喜欢的"],["matched","已匹配"]].map(([value,label]) => <button key={value} onClick={() => setTab(value as typeof tab)} aria-pressed={tab === value} className={cn("search-pill", tab === value && "search-pill-active")}>{label}</button>)}</div>{!authenticated ? <div className="mt-7"><StatusCard text="登录后查看你的喜欢和匹配" /><Link href={authRoute({ returnTo: "/roommates/likes" })} className="primary-action mx-auto mt-4 w-fit">登录</Link></div> : null}{error ? <StatusCard text={error} error /> : null}{authenticated && activity && items.length === 0 ? <StatusCard text="这里还没有记录。" /> : null}<div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((profile) => <ProfileCard key={profile.id ?? profile.name} profile={profile} matched={Boolean(profile.id && activity?.matchedProfileIds.includes(profile.id))} onLikeBack={tab === "inbound" ? () => void likeBack(profile) : undefined} liking={Boolean(likingId)} />)}</div></div></main>;
}

function ProfileCard({ profile, matched, onLikeBack, liking = false }: { profile: ApiRoommate; matched: boolean; onLikeBack?: () => void; liking?: boolean }) { return <article className="overflow-hidden rounded-psw-xl border border-line-strong bg-surface"><Link href={`/roommates/${encodeURIComponent(profile.id ?? "")}`} className="relative block aspect-[4/3] bg-tag-neutral"><SmartImage src={profile.image} alt={profile.name} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" /></Link><div className="p-5"><h2 className="text-m-headline sm:text-d-headline font-bold">{profile.name}, {profile.age}</h2><p className="mt-1 text-m-footnote text-ink-secondary">{profile.role}</p><div className="mt-4 flex gap-2">{matched ? <Link href={`/inbox?roommateId=${encodeURIComponent(profile.id ?? "")}`} className="primary-action"><MessageCircle className="size-4" />开始聊天</Link> : onLikeBack ? <button type="button" disabled={liking} onClick={onLikeBack} className="primary-action"><Heart className="size-4" />也喜欢 TA</button> : <span className="rounded-full bg-surface-subtle px-3 py-2 text-m-footnote font-bold text-primary-text">等待回应</span>}</div></div></article>; }
function StatusCard({ text, error = false }: { text: string; error?: boolean }) { return <div role={error ? "alert" : undefined} className={cn("mt-6 rounded-psw-xl bg-surface p-10 text-center text-d-subhead font-semibold", error ? "text-danger-text" : "text-ink-secondary")}>{text}</div>; }
