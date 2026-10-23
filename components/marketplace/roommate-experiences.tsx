"use client";

import { ArrowLeft, Heart, MessageCircle, UserRoundPen, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";
import { RoommateDetailPanel, RoommateMatchDialog, RoommatePhoto } from "@/components/marketplace/roommate-card";
import { RoommateSwipeDeck } from "@/components/marketplace/roommate-swipe-deck";
import { Badge } from "@/components/ui/badge";
import { SmartImage } from "@/components/ui/smart-image";
import { apiGet } from "@/lib/api";
import type { ApiRoommate, ApiRoommateActivity } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { ProductApiError } from "@/lib/product-errors";
import { getRoommateCard, getRoommateDeck, missingFieldLabels, sendRoommateAction, type RoommateCard, type RoommateDeckResponse } from "@/lib/roommate-matching";
import { cn } from "@/lib/utils";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";

const pageClass = "min-h-[calc(100dvh-72px)] bg-background";

export function RoommatesExperience() {
  const token = useAuthSessionToken();
  return <RoommatesSessionExperience key={token ?? "guest"} token={token} />;
}

function RoommatesSessionExperience({ token }: { token: string | null }) {
  const [deck, setDeck] = useState<RoommateDeckResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && (readStoredAuthSession()?.accessToken ?? null) === token;
    getRoommateDeck(token)
      .then((next) => { if (isCurrent()) setDeck(next); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "室友推荐暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [token, loadAttempt]);

  const viewer = deck?.viewer;
  const prompt = !token
    ? { title: "登录并填写室友资料后可以互相喜欢、开始聊天", action: <Link href={authRoute({ returnTo: "/roommates", intent: "roommate-action" })} className="primary-action">登录</Link> }
    : viewer && (!viewer.hasProfile || viewer.missing.length)
      ? { title: viewer.hasProfile ? "室友资料还没填完" : "填写室友资料后，才能看到双向匹配度", missing: viewer.missing, action: <Link href="/roommates/me" className="primary-action">填写资料</Link> }
      : null;

  return <main className={pageClass}>
    <div className="page-container pb-16 pt-8 sm:pt-12">
      <PageHeader title="找到合拍的室友" description="按入住时间、预算、区域和生活习惯双向匹配。" action={<>
        <Link href="/roommates/likes" className="secondary-action"><Heart className="size-4" aria-hidden="true" />喜欢与匹配</Link>
        <Link href="/roommates/me" className="secondary-action" aria-label="编辑室友资料"><UserRoundPen className="size-4" aria-hidden="true" />室友资料</Link>
      </>} />
      {prompt ? (
        <div className="mt-6 flex flex-col gap-4 rounded-psw-xl bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-m-headline text-ink sm:text-d-headline">{prompt.title}</p>
            {prompt.missing?.length ? <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">还缺：{prompt.missing.map((field) => missingFieldLabels[field]).join("、")}</p> : null}
          </div>
          <div className="shrink-0">{prompt.action}</div>
        </div>
      ) : null}
      {error ? <EmptyState className="mt-6" mood="sorry" title="室友推荐没加载出来" body={<span role="alert">{error}</span>} action={<button type="button" onClick={() => { setError(null); setLoadAttempt((attempt) => attempt + 1); }} className="primary-action">重试</button>} />
        : deck ? <div className="mt-6"><RoommateSwipeDeck token={token} initial={deck} /></div>
        : <StatusCard text="正在加载室友推荐…" />}
    </div>
  </main>;
}

export function RoommateDetailExperience({ profileId }: { profileId: string }) {
  const token = useAuthSessionToken();
  return <RoommateDetailSession key={token ?? "guest"} token={token} profileId={profileId} />;
}

function RoommateDetailSession({ token, profileId }: { token: string | null; profileId: string }) {
  const [card, setCard] = useState<RoommateCard | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [liking, setLiking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [matched, setMatched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled && (readStoredAuthSession()?.accessToken ?? null) === token;
    getRoommateCard(profileId, token)
      .then((next) => { if (isCurrent()) setCard(next); })
      .catch((caught) => { if (isCurrent()) setLoadError(caught); });
    return () => { cancelled = true; };
  }, [profileId, token, loadAttempt]);

  async function like() {
    if (!card || liking) return;
    if (!token) {
      window.location.assign(authRoute({ returnTo: `/roommates/${encodeURIComponent(card.id)}`, intent: "roommate-action" }));
      return;
    }
    setLiking(true);
    setActionError(null);
    try {
      assertCurrentAuthSession(token);
      const result = await sendRoommateAction(token, card.id, "LIKE");
      assertCurrentAuthSession(token);
      setCard({ ...card, youLiked: true, conversationId: result.conversation?.id ?? card.conversationId });
      setMatched(Boolean(result.conversation));
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作没有完成，请重试。");
    } finally {
      setLiking(false);
    }
  }

  const back = <Link href="/roommates" className="secondary-action">返回推荐</Link>;
  let content: ReactNode;
  if (loadError || !card) {
    content = <>
      <PageHeader title="室友详情" />
      {!loadError ? <StatusCard text="正在加载室友资料…" />
        : loadError instanceof ProductApiError && loadError.status === 404
          ? <EmptyState className="mt-6" mood="curious" title="没有找到这位室友" body="资料可能已经隐藏或删除。" action={back} />
          : <EmptyState className="mt-6" mood="sorry" title="室友资料没加载出来" body={<span role="alert">{loadError instanceof Error ? loadError.message : "请稍后重试。"}</span>} action={<button type="button" onClick={() => { setLoadError(null); setLoadAttempt((attempt) => attempt + 1); }} className="primary-action">重试</button>} />}
    </>;
  } else {
    content = <>
      <PageHeader title={card.name} description={[`${card.age} 岁`, card.school].filter(Boolean).join(" · ")} action={<>
        {card.conversationId
          ? <Link href={`/inbox/${encodeURIComponent(card.conversationId)}`} className="primary-action"><MessageCircle className="size-4" aria-hidden="true" />发消息</Link>
          : <button type="button" onClick={() => void like()} disabled={liking || card.youLiked} className="primary-action"><Heart className="size-4" aria-hidden="true" />{card.youLiked ? "已喜欢" : "喜欢"}</button>}
        {back}
      </>} />
      {actionError ? <p role="alert" className="mt-4 text-m-subhead text-danger-text sm:text-d-subhead">{actionError}</p> : null}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-10">
        <RoommatePhoto card={card} priority className="rounded-psw-xl" />
        <RoommateDetailPanel card={card} />
      </div>
      {matched && card.conversationId ? <RoommateMatchDialog name={card.name} icebreaker={card.icebreaker} conversationId={card.conversationId} onClose={() => setMatched(false)} /> : null}
    </>;
  }

  return <main className={pageClass}><div className="page-container pb-16 pt-8 sm:pt-12">{content}</div></main>;
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
    if (!token || !profile.id || likingId) return;
    setLikingId(profile.id);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const result = await sendRoommateAction(token, profile.id, "LIKE");
      assertCurrentAuthSession(token);
      if (result.conversation) window.location.assign(`/inbox/${encodeURIComponent(result.conversation.id)}`);
      else setReloadKey((key) => key + 1);
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

  return <main className={pageClass}>
    <div className="page-container pb-16 pt-6 sm:pt-10">
      <Link href="/roommates" className="-ml-3 mb-2 flex min-h-11 w-fit items-center gap-1 rounded-full px-3 font-rounded text-m-label text-ink-secondary hover:bg-surface-subtle sm:text-d-label"><ArrowLeft className="size-4" aria-hidden="true" />返回匹配</Link>
      <PageHeader title="喜欢与匹配" description="单向的喜欢和双方都喜欢的匹配分开显示。" action={<Link href="/roommates/teams" className="secondary-action"><UsersRound className="size-4" aria-hidden="true" />合租小组</Link>} />
      <div className="mt-6 flex gap-2">
        {([["inbound", "喜欢我的"], ["outbound", "我喜欢的"], ["matched", "已匹配"]] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("search-pill", tab === value && "search-pill-active")}>{label}</button>)}
      </div>
      {!authenticated ? <div className="mt-6 rounded-psw-xl bg-surface p-8 text-center"><p className="text-m-subhead text-ink-secondary sm:text-d-subhead">登录后查看你的喜欢和匹配</p><Link href={authRoute({ returnTo: "/roommates/likes" })} className="primary-action mt-4">登录</Link></div> : null}
      {error ? <StatusCard text={error} error /> : null}
      {authenticated && activity && items.length === 0 ? <StatusCard text="这里还没有记录。" /> : null}
      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((profile) => <ProfileCard key={profile.id ?? profile.name} profile={profile} matched={Boolean(profile.id && activity?.matchedProfileIds.includes(profile.id))} onLikeBack={tab === "inbound" ? () => void likeBack(profile) : undefined} liking={Boolean(likingId)} />)}
      </div>
    </div>
  </main>;
}

function ProfileCard({ profile, matched, onLikeBack, liking }: { profile: ApiRoommate; matched: boolean; onLikeBack?: () => void; liking: boolean }) {
  return <article className="rounded-psw-xl bg-surface p-2 pb-4">
    <Link href={`/roommates/${encodeURIComponent(profile.id ?? "")}`} className="relative block aspect-[4/3] overflow-hidden rounded-psw-lg bg-primary-soft"><SmartImage src={profile.image} alt={profile.name} fill sizes="(max-width:768px) 100vw, 33vw" className="object-cover" /></Link>
    <div className="px-2 pt-3">
      <h2 className="text-m-headline sm:text-d-card-title">{profile.name}<span className="font-display">, {profile.age}</span></h2>
      {profile.role ? <p className="mt-0.5 text-m-footnote text-ink-secondary sm:text-d-footnote">{profile.role}</p> : null}
      <div className="mt-3 flex">
        {matched ? <Link href={`/inbox?roommateId=${encodeURIComponent(profile.id ?? "")}`} className="primary-action"><MessageCircle className="size-4" aria-hidden="true" />开始聊天</Link>
          : onLikeBack ? <button type="button" disabled={liking} onClick={onLikeBack} className="primary-action"><Heart className="size-4" aria-hidden="true" />也喜欢 TA</button>
          : <Badge className="text-m-footnote">等待回应</Badge>}
      </div>
    </div>
  </article>;
}

function StatusCard({ text, error = false }: { text: string; error?: boolean }) {
  return <p role={error ? "alert" : "status"} className={`mt-6 rounded-psw-xl bg-surface p-10 text-center text-m-subhead sm:text-d-subhead ${error ? "text-danger-text" : "text-ink-secondary"}`}>{text}</p>;
}
