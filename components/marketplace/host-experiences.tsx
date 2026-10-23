"use client";

import { Building2, CalendarDays, ClipboardCheck, Eye, MapPin, MessageCircle, Pencil, Plus } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState as SharedEmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";

import { ApplicationCancellation } from "@/components/application-cancellation";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import { PaymentPanel } from "@/components/payment-panel";
import { PublishingFlow } from "@/components/sublet-app";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { ApiDealThread, ApiListing } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { getListingCoverUrl } from "@/lib/listing-media";
import { executePublishSave, mapApiListingToPublishDraft } from "@/lib/publish-listing";
import type { PublishDraft, PublishSaveResult } from "@/lib/publish-listing";
import {
  acceptRentalApplication,
  getRentalApplicationStatusCopy,
  getHostRentalApplications,
  mergeRentalApplicationUpdate,
  newIdempotencyKey,
  rejectRentalApplication
} from "@/lib/rental-applications";
import type { ApiRentalApplication, RentalApplicationStatus } from "@/lib/rental-applications";
import { useMarketplaceSession } from "@/lib/use-marketplace-session";
import { formatRangeLong, formatRangeShort } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/marketplace/confirm-dialog";

export function HostDashboardExperience() {
  const token = useAuthSessionToken();
  return <HostDashboardExperienceSession key={token ?? "guest"} />;
}

function HostDashboardExperienceSession() {
  const session = useMarketplaceSession();
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [threads, setThreads] = useState<ApiDealThread[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(session.token));
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === session.token;
    setLoading(true);
    setError(null);
    Promise.all([
      apiGet<ApiListing[]>("/listings/mine", session.token),
      getHostRentalApplications(session.token),
      apiGet<ApiDealThread[]>("/deal-threads", session.token)
    ]).then(([nextListings, nextApplications, nextThreads]) => {
      if (!isCurrent()) return;
      setListings(nextListings);
      setApplications(nextApplications);
      setThreads(nextThreads);
    }).catch(() => { if (isCurrent()) setError("工作台暂时无法加载，请重试。"); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.token, loadAttempt]);

  const waitingApplications = applications.filter((item) => item.status === "SUBMITTED");
  const waitingTours = threads.filter((thread) => thread.viewerRole === "host").flatMap((thread) => (thread.viewingRequests ?? []).filter((item) => item.status === "REQUESTED").map((request) => ({ request, thread })));
  const inReview = listings.filter((item) => item.status === "SUBMITTED");
  const pendingApplications = waitingApplications.length;
  const pendingTours = waitingTours.length;
  const publishedListings = listings.filter((item) => item.status === "APPROVED").length;
  const totalsReady = Boolean(session.user && !session.loading && !session.error && !loading && !error);

  return <HostPage title="今天需要处理什么" description="查看待审核申请、待确认预约与已发布房源。" action={<Link href="/host/listings/new" className="primary-action"><Plus className="size-4" />发布新房源</Link>}>
    {!session.token ? <LoginGate text="登录后查看你发布的房间" returnTo="/host" /> : null}
    {error || session.error ? <ErrorNotice text={error ?? session.error!} /> : null}
    {error || session.error ? <button type="button" onClick={() => { if (session.error) session.reload(); setLoadAttempt((attempt) => attempt + 1); }} className="secondary-action mt-4">重新加载工作台</button> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-ink-secondary">正在加载工作台…</p> : null}
    {totalsReady && listings.length === 0 ? <SharedEmptyState className="mt-7" mood="happy" title="发布你的第一间房" body="准备好可租日期、转租月租和几张照片，再声明房东知情。平台审核通过后，租客就能在搜索里看到它。" action={<Link href="/host/listings/new" className="primary-action"><Plus className="size-4" aria-hidden="true" />发布房间</Link>} /> : null}
    {session.token && !(totalsReady && listings.length === 0) ? <><section className="mt-7 grid grid-cols-3 gap-3 sm:gap-4" aria-label="关键指标">
      <Metric icon={ClipboardCheck} label="待处理申请" value={totalsReady ? String(pendingApplications) : "—"} href="/host/applications" />
      <Metric icon={CalendarDays} label="待确认预约" value={totalsReady ? String(pendingTours) : "—"} href="/inbox" />
      <Metric icon={Building2} label="在线房源" value={totalsReady ? String(publishedListings) : "—"} href="/host/listings" />
    </section>
    {/* The actual things waiting for the 转租人, each one tap from where it is handled. */}
    {totalsReady ? <section className="mt-6 rounded-psw-xl bg-surface p-5 sm:p-6" aria-labelledby="host-todo">
      <h2 id="host-todo" className="text-m-headline sm:text-d-headline">要你处理的事</h2>
      {waitingApplications.length || waitingTours.length || inReview.length ? <ul className="mt-3 divide-y divide-line-strong">
        {waitingApplications.slice(0, 5).map((item) => <TodoRow key={item.id} href="/host/applications" icon={ClipboardCheck} title={`${item.contactName ?? item.memberSnapshots?.[0]?.displayName ?? "有人"}申请了「${item.listingTitle ?? "你的房间"}」`} detail={[item.moveIn && item.moveOut ? formatRangeLong(item.moveIn.slice(0, 10), item.moveOut.slice(0, 10)) : "", "看资料后接受或不通过"].filter(Boolean).join(" · ")} action="看申请" />)}
        {waitingTours.slice(0, 5).map(({ request, thread }) => <TodoRow key={request.id} href={`/inbox/${encodeURIComponent(thread.id)}`} icon={CalendarDays} title={`${thread.contactName ?? "有人"}想${request.mode === "video" ? "视频" : "线下"}看房`} detail={[request.timeLabel, thread.listingTitle].filter(Boolean).join(" · ")} action="确认时间" />)}
        {waitingApplications.length > 5 ? <li><Link href="/host/applications" className="flex min-h-11 items-center py-3 font-rounded text-d-label text-primary-text">还有 {waitingApplications.length - 5} 份申请，去申请审核看全部</Link></li> : null}
        {inReview.slice(0, 5).map((item) => <TodoRow key={item.id} href="/host/listings" icon={Building2} title={`「${item.title}」在等平台审核`} detail="审核通过后会出现在搜索里，不用做什么。" />)}
      </ul> : <p className="mt-2 text-d-subhead text-ink-secondary">现在没有要处理的事。新的申请和看房请求会出现在这里。</p>}
    </section> : null}</> : null}
  </HostPage>;
}

export function HostListingsExperience() {
  const token = useAuthSessionToken();
  return <HostListingsExperienceSession key={token ?? "guest"} />;
}

function HostListingsExperienceSession() {
  const session = useMarketplaceSession();
  const [listings, setListings] = useState<ApiListing[]>([]);
  const [tab, setTab] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(session.token));
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    if (!session.token) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === session.token;
    setLoading(true);
    setError(null);
    apiGet<ApiListing[]>("/listings/mine", session.token)
      .then((items) => { if (isCurrent()) setListings(items); })
      .catch(() => { if (isCurrent()) setError("房源暂时无法加载，请重试。"); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [session.token, loadAttempt]);
  const visible = listings.filter((listing) => tab === "all" || statusKey(listing.status) === tab);

  return <HostPage title="我的房源" description="按生命周期查看草稿、审核和发布状态。" action={<Link href="/host/listings/new" className="primary-action"><Plus className="size-4" />发布新房源</Link>}>
    {session.token ? <div className="mt-6 flex gap-2 overflow-x-auto">{[["all","全部"],["draft","草稿"],["review","审核中"],["published","已发布"],["rented","已出租"],["suspended","已下架"]].map(([value,label]) => <button key={value} type="button" onClick={() => setTab(value)} aria-pressed={tab === value} className={cn("search-pill min-h-9 px-3.5", tab === value && "search-pill-active")}>{label}</button>)}</div> : null}
    {!session.token ? <LoginGate text="登录后查看你发布的房间" returnTo="/host/listings" /> : null}
    {error || session.error ? <ErrorNotice text={error ?? session.error!} /> : null}
    {error || session.error ? <button type="button" onClick={() => { if (session.error) session.reload(); setLoadAttempt((attempt) => attempt + 1); }} className="secondary-action mt-4">重新加载房源</button> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-ink-secondary">正在加载房源…</p> : null}
    {session.user && !loading && visible.length === 0 && !error && !session.error ? tab === "all" ? <SharedEmptyState className="mt-6" mood="sleepy" title="你还没有发布房间" body="寒暑假要回国？把房间挂出来，别让空房白交房租。" action={<Link href="/host/listings/new" className="primary-action"><Plus className="size-4" aria-hidden="true" />发布房间</Link>} /> : <EmptyState text="这个状态下还没有房源。" /> : null}
    <div className="mt-6 grid gap-5 lg:grid-cols-2">{visible.map((listing, index) => <article key={listing.id} className="grid overflow-hidden rounded-psw-xl bg-surface sm:grid-cols-[190px_minmax(0,1fr)]"><div className="relative min-h-48 bg-tag-neutral"><SmartImage src={getListingCoverUrl(listing)} alt={listing.title} fill priority={index < 4} fetchPriority={index < 4 ? "high" : "auto"} sizes="190px" className="object-cover" /></div><div className="flex flex-col p-5"><span className={cn("w-fit rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", listing.status === "APPROVED" ? "bg-success-soft text-success-text" : listing.status === "SUBMITTED" ? "bg-warning-soft text-warning-text" : "bg-tag-neutral text-ink-secondary")}>{statusLabel(listing.status)}</span><h2 className="mt-3 text-d-card-title text-ink">{listing.title}</h2><p className="mt-1 flex items-center gap-1 text-m-footnote text-ink-secondary"><MapPin className="size-3.5" aria-hidden="true" />{listing.area}</p>{listing.availableFrom && listing.availableTo ? <p className="mt-1 flex items-center gap-1 text-m-footnote font-semibold text-ink"><CalendarDays className="size-3.5" aria-hidden="true" />{formatRangeShort(listing.availableFrom.slice(0, 10), listing.availableTo.slice(0, 10))} 可住</p> : null}{listing.status === "SUBMITTED" ? <p className="mt-1 text-m-footnote text-ink-secondary">平台审核通过后出现在搜索里。</p> : null}<p className="mt-3"><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">${listing.price.toLocaleString("en-US")}</span><span className="ml-1 text-m-footnote text-ink-secondary">/ 月</span></p><div className="mt-auto flex gap-2 pt-5"><Link href={`/host/listings/${listing.id}`} className="secondary-action"><Pencil className="size-3.5" />管理</Link>{listing.status === "APPROVED" ? <Link href={`/listing/${listing.id}`} className="secondary-action"><Eye className="size-3.5" aria-hidden="true" />看租客看到的样子</Link> : null}</div></div></article>)}</div>
  </HostPage>;
}

export function HostApplicationsExperience() {
  const token = useAuthSessionToken();
  return <HostApplicationsExperienceSession key={token ?? "guest"} />;
}

function HostApplicationsExperienceSession() {
  const [confirmDialog, confirm] = useConfirm();
  const session = useMarketplaceSession();
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(session.token));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<{ id: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const loadVersion = useRef(0);
  const decisionCommands = useRef(new Map<string, string>());
  useEffect(() => {
    active.current = true;
    loadVersion.current++;
    return () => { active.current = false; };
  }, []);
  const load = useCallback(async () => {
    if (!session.token) return;
    const version = ++loadVersion.current;
    const isCurrent = () => active.current && version === loadVersion.current && readStoredAuthSession()?.accessToken === session.token;
    setLoading(true);
    setLoadError(null);
    try {
      const items = await getHostRentalApplications(session.token);
      if (isCurrent()) setApplications(items);
    } catch {
      if (isCurrent()) setLoadError("申请列表暂时无法刷新，请重新加载。");
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [session.token]);
  useEffect(() => { void load(); }, [load]);

  function applyApplication(updated: ApiRentalApplication) {
    // A read started before a decision or cancellation must not undo its result.
    loadVersion.current++;
    setLoading(false);
    setApplications((current) => current.map((item) => item.id === updated.id ? mergeRentalApplicationUpdate(item, updated) : item));
  }

  async function decide(application: ApiRentalApplication, decision: "accept" | "reject") {
    if (!session.token || busy.current || loading || session.loading || session.error || application.status !== "SUBMITTED") return;
    if (readStoredAuthSession()?.accessToken !== session.token) {
      setDecisionError({ id: application.id, message: "登录账号已变化，请刷新页面后再操作。" });
      return;
    }
    const who = application.contactName ?? application.memberSnapshots?.[0]?.displayName ?? "申请人";
    const answer = await confirm(decision === "accept"
      ? { title: `接受${who}的申请？`, body: "接受后，这份申请进入签约和付款。", confirmLabel: "接受申请" }
      : { title: `不通过${who}的申请？`, body: "请写一句原因，对方会看到。", confirmLabel: "不通过", tone: "danger", reason: { label: "不通过的原因", placeholder: "例如：入住日期和可租期对不上" } });
    if (answer === false) return;
    const reason = decision === "reject" ? answer : undefined;
    busy.current = true;
    loadVersion.current++;
    setPendingId(application.id);
    setDecisionError(null);
    setNotice(null);
    const signature = JSON.stringify([application.id, decision, reason ?? null]);
    const key = decisionCommands.current.get(signature) ?? newIdempotencyKey(`host-${decision}`);
    decisionCommands.current.set(signature, key);
    const isCurrent = () => active.current && readStoredAuthSession()?.accessToken === session.token;
    try {
      assertCurrentAuthSession(session.token);
      const updated = decision === "accept"
        ? await acceptRentalApplication(session.token, application.id, key)
        : await rejectRentalApplication(session.token, application.id, reason!, key);
      if (!isCurrent()) return;
      applyApplication(updated);
      decisionCommands.current.delete(signature);
      setNotice({ id: application.id, message: decision === "accept" ? "已接受这份申请。" : "已拒绝这份申请。" });
      await load();
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof Error && "status" in caught && caught.status === 409) {
        setDecisionError({ id: application.id, message: "申请状态或房源条件已变化，请核对最新内容后再决定。" });
        await load();
      } else {
        setDecisionError({ id: application.id, message: caught instanceof Error ? caught.message : "审核结果暂时无法确认，请重试或重新加载申请。" });
      }
    } finally {
      busy.current = false;
      if (isCurrent()) setPendingId(null);
    }
  }

  return <HostPage title="申请审核" description="比较候选资料、联系申请人，再做决定。" action={session.token ? <button type="button" disabled={loading || session.loading || Boolean(pendingId)} onClick={() => { if (session.error) session.reload(); setDecisionError(null); void load(); }} className="secondary-action">{loading || session.loading ? "正在刷新…" : loadError || session.error ? "重新加载申请" : "刷新申请"}</button> : undefined}>
    <span className="sr-only">申请资料 要求补充 接受申请</span>
    {!session.token ? <LoginGate text="登录后查看收到的申请" returnTo="/host/applications" /> : null}
    {loadError || session.error ? <ErrorNotice text={loadError ?? session.error!} /> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-ink-secondary">正在加载申请…</p> : null}
    {session.user && !loading && applications.length === 0 && !loadError && !session.error ? <SharedEmptyState className="mt-6" mood="sleepy" title="暂时没有租房申请。" body="房间上架后，租客的申请会出现在这里，你可以先看资料再决定。" action={<Link href="/host/listings" className="secondary-action">看我的房源</Link>} /> : null}
    <fieldset disabled={loading || session.loading || Boolean(pendingId)} className="mt-6 grid min-w-0 gap-4" aria-label="申请列表">{applications.map((application) => {
      const presentation = getHostApplicationPresentation(application.status);
      return <article key={application.id} className="min-w-0 [overflow-wrap:anywhere] rounded-psw-xl border border-line-strong bg-surface p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-m-headline sm:text-d-headline font-bold">{application.listingTitle ?? "房源申请"}</h2><span className={cn("rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", application.status === "SUBMITTED" ? "bg-warning-soft text-warning-text" : "bg-tag-neutral text-ink-secondary")}>{presentation.statusLabel}</span></div><p className="mt-2 text-d-subhead text-ink-secondary">{application.memberSnapshots.map((item) => item.displayName).join("、") || "个人申请"} · {formatRangeLong(application.moveIn.slice(0, 10), application.moveOut.slice(0, 10))}</p><p className="mt-3 text-sm font-bold">{application.schoolOrOccupation}</p>{application.contactName || application.contactEmail ? <p className="mt-2 text-sm text-ink-secondary">联系人：{[application.contactName, application.contactEmail].filter(Boolean).join(" · ")}</p> : null}<HostApplicationFacts application={application} />{application.note ? <p className="mt-3 whitespace-pre-wrap rounded-psw-lg bg-surface-muted p-4 text-sm leading-6 text-ink-secondary">{application.note}</p> : null}</div><div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">{application.status === "SUBMITTED" ? <><button disabled={Boolean(pendingId) || loading || session.loading || Boolean(session.error)} onClick={() => void decide(application, "accept")} className="primary-action">{pendingId === application.id ? "正在处理…" : "接受申请"}</button><button disabled={Boolean(pendingId) || loading || session.loading || Boolean(session.error)} onClick={() => void decide(application, "reject")} className="secondary-action text-danger-text">不通过</button></> : null}<Link href={`/inbox?${new URLSearchParams({ listingId: application.listingId, applicantId: application.submitterId }).toString()}`} className="secondary-action"><MessageCircle className="size-4" />{presentation.contactLabel}</Link></div></div>{decisionError?.id === application.id ? <p role="alert" className="mt-4 rounded-psw-lg bg-danger-soft p-4 text-sm font-bold text-danger-text">{decisionError.message}</p> : null}{notice?.id === application.id ? <p role="status" className="mt-4 rounded-psw-lg bg-surface-subtle p-4 text-sm font-bold text-ink">{notice.message}</p> : null}{session.token && session.user ? <ApplicationCancellation application={application} token={session.token} currentUserId={session.user.id} onApplicationChange={applyApplication} /> : null}{session.token && session.user && (application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" || application.status === "CANCELLED") ? <div className="mt-5"><PaymentPanel application={application} token={session.token} currentUserId={session.user.id} onApplicationChange={applyApplication} /></div> : null}</article>;
    })}</fieldset>
    {confirmDialog}
  </HostPage>;
}

function HostApplicationFacts({ application }: { application: ApiRentalApplication }) {
  const income = { BELOW_2X: "低于月租 2 倍", TWO_TO_THREE_X: "月租 2–3 倍", THREE_TO_FOUR_X: "月租 3–4 倍", ABOVE_FOUR_X: "高于月租 4 倍", PREFER_NOT_TO_SAY: "不愿透露" }[application.incomeBand];
  const guarantor = { AVAILABLE: "可提供", NOT_AVAILABLE: "无法提供", NOT_NEEDED: "不需要" }[application.guarantorStatus];
  return <dl className="mt-4 grid grid-cols-2 gap-3 rounded-psw-lg border border-line-strong p-4 text-sm">
    <div><dt className="text-m-footnote text-ink-secondary">收入区间</dt><dd className="mt-1 font-bold">{income}</dd></div>
    <div><dt className="text-m-footnote text-ink-secondary">担保人</dt><dd className="mt-1 font-bold">{guarantor}</dd></div>
  </dl>;
}

export function HostListingEditorExperience({ listingId }: { listingId?: string }) {
  const token = useAuthSessionToken();
  return <HostListingEditorSession key={`${listingId ?? "new"}:${token ?? "guest"}`} listingId={listingId} />;
}

function HostListingEditorSession({ listingId }: { listingId?: string }) {
  const session = useMarketplaceSession();
  const [listing, setListing] = useState<ApiListing | null>(null);
  const [loadingListing, setLoadingListing] = useState(Boolean(listingId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!session.token || !listingId) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === session.token;
    setLoadingListing(true);
    setLoadError(null);
    apiGet<ApiListing[]>("/listings/mine", session.token)
      .then((items) => { if (isCurrent()) setListing(items.find((item) => item.id === listingId) ?? null); })
      .catch(() => { if (isCurrent()) setLoadError("房源暂时无法加载，请重试。"); })
      .finally(() => { if (isCurrent()) setLoadingListing(false); });
    return () => { cancelled = true; };
  }, [listingId, session.token, loadAttempt]);

  async function save(draft: PublishDraft, shouldSubmit: boolean): Promise<PublishSaveResult | null> {
    if (!session.token || (listingId && !listing)) return null;
    setPublishing(true);
    setMessage(null);
    try {
      const result = await executePublishSave(draft, {
        create: (dto) => { assertCurrentAuthSession(session.token); return apiPost<ApiListing>("/listings", dto, session.token!); },
        update: (id, dto) => { assertCurrentAuthSession(session.token); return apiPatch<ApiListing>(`/listings/${encodeURIComponent(id)}`, dto, session.token!); },
        submit: (id) => { assertCurrentAuthSession(session.token); return apiPost<ApiListing>(`/listings/${encodeURIComponent(id)}/submit`, {}, session.token!); }
      }, shouldSubmit);
      setMessage(result.message);
      return result;
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "房源保存失败。");
      return null;
    } finally { setPublishing(false); }
  }

  const canEdit = Boolean(session.profile && ["lister", "both"].includes(session.profile.role));
  return <HostPage title={listingId ? "管理房源" : "发布新房源"} description="完善房源资料与照片，保存草稿后提交审核。">
    {!session.token ? <LoginGate text="登录后继续发布" returnTo={listingId ? `/host/listings/${listingId}` : "/host/listings/new"} /> : null}
    {session.profile && !["lister", "both"].includes(session.profile.role) ? <RoleGate /> : null}
    {session.error ? <><ErrorNotice text={session.error} /><button type="button" onClick={session.reload} className="secondary-action mt-4">重新加载账户</button></> : null}
    {session.token && (session.loading || (canEdit && loadingListing)) ? <p role="status" className="mt-6 text-sm font-bold text-ink-secondary">正在加载房源…</p> : null}
    {canEdit && loadError ? <><ErrorNotice text={loadError} /><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="secondary-action mt-4">重新加载房源</button></> : null}
    {canEdit && listingId && !loadingListing && !loadError && !listing ? <section className="mt-6 rounded-psw-xl border border-line-strong bg-surface p-6"><p className="text-sm font-bold text-ink-secondary">未找到这套房源，或你没有管理权限。</p><Link href="/host/listings" className="primary-action mt-5">返回我的房源</Link></section> : null}
    {message ? <p className="mt-5 rounded-psw-lg bg-surface-subtle p-4 text-sm font-bold text-ink">{message}</p> : null}
    {session.token && canEdit && !loadingListing && !loadError && (!listingId || listing) ? <div className="mt-6"><PublishingFlow initialDraft={listing ? mapApiListingToPublishDraft(listing) : null} isPublishing={publishing} token={session.token} onSave={save} /></div> : null}
  </HostPage>;
}

function HostPage({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) { return <main className="min-h-dvh bg-background px-4 pb-16 pt-8 sm:px-8 sm:pt-10"><div className="mx-auto max-w-[1200px]"><PageHeader title={title} description={description} action={action} />{children}</div></main>; }
function LoginGate({ text, returnTo }: { text: string; returnTo: string }) { return <SharedEmptyState className="mt-6" mood="default" title={text} body="用邮箱验证码登录后，就能看到你发布的房源和收到的申请。" action={<Link href={authRoute({ returnTo })} className="primary-action">登录</Link>} />; }
function ErrorNotice({ text }: { text: string }) { return <p role="alert" className="mt-6 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{text}</p>; }
function EmptyState({ text }: { text: string }) { return <SharedEmptyState className="mt-6" mood="sleepy" title={text} />; }
function RoleGate() { return <section className="mt-6 rounded-psw-xl border border-dashed border-outline bg-surface p-8 text-center"><p className="text-sm font-bold text-ink-secondary">请先在账户资料中将身份设置为转租人或租客兼转租人。</p><Link href="/account/profile" className="primary-action mt-5">前往账户资料</Link></section>; }
function TodoRow({ href, icon: Icon, title, detail, action }: { href: string; icon: typeof Building2; title: string; detail: string; action?: string }) {
  return <li><Link href={href} className="flex min-h-14 items-center gap-3 py-3 hover:text-primary-text"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-text"><Icon className="size-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-d-label text-ink">{title}</span><span className="mt-0.5 block text-m-footnote text-ink-secondary">{detail}</span></span>{action ? <span className="shrink-0 font-rounded text-d-label text-primary-text">{action}</span> : null}</Link></li>;
}

function Metric({ icon: Icon, label, value, href }: { icon: typeof Building2; label: string; value: string; href: string }) { return <Link href={href} className="flex flex-col rounded-psw-xl bg-surface p-4 transition-shadow hover:shadow-card-hover sm:p-5"><span className="hidden size-10 place-items-center rounded-full bg-primary-soft text-primary-text sm:grid"><Icon className="size-5" aria-hidden="true" /></span><span className="text-m-footnote font-semibold text-ink-secondary sm:mt-4">{label}</span><span className="mt-1 font-display text-[28px] font-extrabold leading-9 text-ink sm:text-d-price-large">{value}</span></Link>; }
function statusKey(status?: ApiListing["status"]) { return status === "DRAFT" || status === "REJECTED" ? "draft" : status === "SUBMITTED" ? "review" : status === "APPROVED" ? "published" : status === "SUSPENDED" ? "suspended" : "rented"; }
function statusLabel(status?: ApiListing["status"]) { return status === "DRAFT" ? "草稿" : status === "SUBMITTED" ? "审核中" : status === "APPROVED" ? "已发布" : status === "REJECTED" ? "已退回" : status === "SUSPENDED" ? "已下架" : "已出租"; }

export function getHostApplicationPresentation(status: RentalApplicationStatus) {
  return {
    // This page is the 转租人's own view, so a waiting application is waiting for "you".
    statusLabel: status === "SUBMITTED" ? "待你处理" : getRentalApplicationStatusCopy(status).label,
    contactLabel: status === "SUBMITTED" ? "要求补充" : "联系申请人"
  };
}
