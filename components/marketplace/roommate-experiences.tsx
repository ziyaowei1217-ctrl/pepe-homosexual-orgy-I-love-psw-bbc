"use client";

import { ArrowLeft, Check, Heart, MessageCircle, Settings2, Sparkles, UsersRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  const active = roommates[index] ?? null;

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && (readStoredAuthSession()?.accessToken ?? null) === token;
    apiGet<ApiRoommateDeckResponse>("/roommates/deck?limit=24", token ?? undefined)
      .then((deck) => { if (isCurrent()) setRoommates(deck.items); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "室友推荐暂时无法加载。"); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

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

  return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]">
    <section className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-[1320px] flex-col justify-between gap-4 px-4 py-5 sm:px-6 sm:py-9 lg:flex-row lg:items-end lg:px-8"><div><p className="hidden items-center gap-2 text-xs font-black uppercase tracking-[0.15em] lg:flex text-[#0668e1]"><UsersRound className="size-4" />Roommate match</p><h1 className="text-3xl font-black tracking-[-0.055em] sm:text-6xl lg:mt-3">找到合拍的室友</h1><p className="mt-2 text-sm leading-6 text-slate-500 sm:mt-4">浏览室友资料，互相喜欢后即可开始聊天。</p></div><div className="flex gap-2"><Link href="/roommates/likes" className="secondary-action"><Heart className="size-4" />喜欢列表</Link><Link href="/account/profile" className="secondary-action" aria-label="编辑个人资料"><Settings2 className="size-4" /></Link></div></div></section>
    <div className="mx-auto grid max-w-[1320px] gap-6 px-4 py-5 sm:px-6 sm:py-8 lg:grid-cols-[290px_minmax(0,1fr)] lg:px-8">
      <aside className="order-last h-fit rounded-[24px] border border-slate-200 bg-white p-5 lg:order-first"><p className="text-xs font-black uppercase tracking-[.13em] text-[#0668e1]">你的个人资料</p><h2 className="mt-2 text-xl font-black">让室友认识你</h2><p className="mt-3 text-sm leading-6 text-slate-500">补充城市、学校和个人简介，方便彼此了解。</p><Link href="/account/profile" className="mt-5 inline-flex text-xs font-black text-[#0668e1]">编辑资料 →</Link></aside>
      <section className="min-w-0">
        <p className="sr-only">为什么适合你</p>
        {loading ? <StatusCard text="正在加载室友推荐…" /> : null}
        {error ? <StatusCard text={error} error /> : null}
        {!loading && !error && !active ? <StatusCard text="当前没有新的推荐，稍后再来看看。" /> : null}
        {active ? <article className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-xl"><div className="relative h-[240px] bg-slate-100 sm:h-[420px] lg:h-[560px]"><Image src={active.image} alt={active.name} fill priority sizes="(max-width:1024px) 100vw, 65vw" className="object-cover object-[50%_20%]" /><div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" /><div className="absolute left-5 top-5 rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#0668e1]">{active.compatibilityScore ?? active.match}% 匹配</div><div className="absolute inset-x-6 bottom-6 text-white"><h2 className="text-4xl font-black">{active.name}, {active.age}</h2><p className="mt-2 text-sm text-slate-200">{active.role}</p></div></div><div className="grid gap-4 p-4 sm:gap-6 sm:p-6 md:grid-cols-2"><div><p className="text-xs font-black text-slate-400">预算与地点</p><p className="mt-2 text-sm font-black">{active.budget} · {active.commute}</p><div className="mt-4 flex flex-wrap gap-2">{active.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{tag}</span>)}</div></div><div className="hidden rounded-[20px] bg-blue-50 p-5 md:block"><h3 className="flex items-center gap-2 text-sm font-black"><Sparkles className="size-4 text-[#0668e1]" />为什么适合你</h3><ul className="mt-4 space-y-2">{(active.reasons ?? active.recommendation?.primarySignals ?? []).map((reason) => <li key={reason} className="flex gap-2 text-xs text-blue-900"><Check className="size-3.5 shrink-0" />{reason}</li>)}</ul></div><details className="rounded-2xl bg-blue-50 p-4 md:hidden"><summary className="cursor-pointer text-sm font-bold text-blue-900">为什么适合你</summary><ul className="mt-3 space-y-2">{(active.reasons ?? active.recommendation?.primarySignals ?? []).map((reason) => <li key={reason} className="flex gap-2 text-xs leading-5 text-blue-900"><Check className="mt-0.5 size-3.5 shrink-0" />{reason}</li>)}</ul></details></div><div className="flex justify-center gap-2 border-t border-slate-200 p-4 sm:gap-4 sm:p-5"><button disabled={pending} onClick={() => void decide("PASS")} className="grid size-14 place-items-center rounded-full border border-slate-200" aria-label={`跳过 ${active.name}`}><X className="size-5" /></button><button disabled={pending} onClick={() => void decide("LIKE")} className="primary-action px-4 sm:px-8"><Heart className="size-5" />感兴趣</button>{active.id ? <Link href={`/roommates/${encodeURIComponent(active.id)}`} className="secondary-action">查看资料</Link> : null}</div></article> : null}
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

  useEffect(() => {
    if (!token) return;
    setAuthenticated(true);
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    apiGet<ApiRoommateActivity>("/roommates/activity", token)
      .then((next) => { if (isCurrent()) setActivity(next); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "喜欢列表暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [token]);

  const items = useMemo(() => {
    if (!activity) return [];
    if (tab === "inbound") return activity.inbound.map((item) => item.profile);
    if (tab === "outbound") return activity.outbound.map((item) => item.profile);
    return activity.outbound.map((item) => item.profile).filter((profile) => profile.id && activity.matchedProfileIds.includes(profile.id));
  }, [activity, tab]);

  return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]"><div className="mx-auto max-w-[1220px] px-4 py-10 sm:px-6 lg:px-8"><header className="border-b border-slate-200 pb-7"><Link href="/roommates" className="flex items-center gap-1 text-xs font-black text-slate-500"><ArrowLeft className="size-3.5" />返回匹配</Link><h1 className="mt-4 text-4xl font-black tracking-[-0.055em] sm:text-6xl">喜欢与匹配</h1><p className="mt-3 text-sm text-slate-500">单向兴趣和双方匹配分别展示。</p><Link href="/roommates/teams" className="secondary-action mt-5"><UsersRound className="size-4" />合租小组</Link></header><div className="mt-7 flex gap-2">{[["inbound","喜欢我的"],["outbound","我喜欢的"],["matched","已匹配"]].map(([value,label]) => <button key={value} onClick={() => setTab(value as typeof tab)} className={cn("rounded-full border px-4 py-2.5 text-sm font-black", tab === value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white")}>{label}</button>)}</div>{!authenticated ? <div className="mt-7"><StatusCard text="登录后查看真实喜欢与匹配" /><Link href={authRoute({ returnTo: "/roommates/likes" })} className="primary-action mx-auto mt-4 w-fit">登录</Link></div> : null}{error ? <StatusCard text={error} error /> : null}{authenticated && activity && items.length === 0 ? <StatusCard text="这里还没有记录。" /> : null}<div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{items.map((profile) => <ProfileCard key={profile.id ?? profile.name} profile={profile} matched={Boolean(profile.id && activity?.matchedProfileIds.includes(profile.id))} />)}</div></div></main>;
}

function ProfileCard({ profile, matched }: { profile: ApiRoommate; matched: boolean }) { return <article className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm"><Link href={`/roommates/${encodeURIComponent(profile.id ?? "")}`} className="relative block aspect-[4/3] bg-slate-100"><Image src={profile.image} alt={profile.name} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" /></Link><div className="p-5"><h2 className="text-lg font-black">{profile.name}, {profile.age}</h2><p className="mt-1 text-xs text-slate-500">{profile.role}</p><div className="mt-4 flex gap-2">{matched ? <Link href={`/inbox?roommateId=${encodeURIComponent(profile.id ?? "")}`} className="primary-action"><MessageCircle className="size-4" />开始聊天</Link> : <span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">等待回应</span>}</div></div></article>; }
function StatusCard({ text, error = false }: { text: string; error?: boolean }) { return <div role={error ? "alert" : undefined} className={cn("mt-6 rounded-[24px] border border-dashed bg-white p-10 text-center text-sm font-bold", error ? "border-red-200 text-red-700" : "border-slate-300 text-slate-500")}>{text}</div>; }
