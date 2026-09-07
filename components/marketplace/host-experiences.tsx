"use client";

import { Building2, CalendarDays, ClipboardCheck, Eye, MapPin, MessageCircle, Pencil, Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

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
import { cn } from "@/lib/utils";

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

  const pendingApplications = applications.filter((item) => item.status === "SUBMITTED").length;
  const pendingTours = threads.filter((thread) => thread.viewerRole === "host").flatMap((thread) => thread.viewingRequests).filter((item) => item.status === "REQUESTED").length;
  const publishedListings = listings.filter((item) => item.status === "APPROVED").length;
  const totalsReady = Boolean(session.user && !session.loading && !session.error && !loading && !error);

  return <HostPage title="今天需要处理什么" description="查看待审核申请、待确认预约与已发布房源。" action={<Link href="/host/listings/new" className="primary-action"><Plus className="size-4" />发布新房源</Link>}>
    {!session.token ? <LoginGate text="登录后读取实时数据" returnTo="/host" /> : null}
    {error || session.error ? <ErrorNotice text={error ?? session.error!} /> : null}
    {error || session.error ? <button type="button" onClick={() => { if (session.error) session.reload(); setLoadAttempt((attempt) => attempt + 1); }} className="secondary-action mt-4">重新加载工作台</button> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-slate-500">正在加载工作台…</p> : null}
    <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="关键指标">
      <Metric icon={ClipboardCheck} label="待处理申请" value={totalsReady ? String(pendingApplications) : "—"} href="/host/applications" />
      <Metric icon={CalendarDays} label="待确认预约" value={totalsReady ? String(pendingTours) : "—"} href="/inbox" />
      <Metric icon={Building2} label="在线房源" value={totalsReady ? String(publishedListings) : "—"} href="/host/listings" />
    </section>
    <section className="mt-6 rounded-[26px] border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-lg font-black">优先待办</h2><p className="mt-2 text-sm text-slate-500">先查看申请人的资料，再到消息中确认看房安排。</p><div className="mt-5 flex flex-wrap gap-3"><Link href="/host/applications" className="secondary-action">查看申请</Link><Link href="/inbox" className="secondary-action">打开消息</Link><Link href="/host/listings" className="secondary-action">管理房源</Link></div></section>
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
    <div className="mt-6 flex gap-2 overflow-x-auto">{[["all","全部"],["draft","草稿"],["review","审核中"],["published","已发布"],["rented","已出租"]].map(([value,label]) => <button key={value} onClick={() => setTab(value)} className={cn("rounded-full border px-4 py-2.5 text-xs font-black", tab === value ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white")}>{label}</button>)}</div>
    {!session.token ? <LoginGate text="登录后读取真实房源" returnTo="/host/listings" /> : null}
    {error || session.error ? <ErrorNotice text={error ?? session.error!} /> : null}
    {error || session.error ? <button type="button" onClick={() => { if (session.error) session.reload(); setLoadAttempt((attempt) => attempt + 1); }} className="secondary-action mt-4">重新加载房源</button> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-slate-500">正在加载房源…</p> : null}
    {session.user && !loading && visible.length === 0 && !error && !session.error ? <EmptyState text="这个状态下还没有房源。" /> : null}
    <div className="mt-6 grid gap-5 lg:grid-cols-2">{visible.map((listing, index) => <article key={listing.id} className="grid overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm sm:grid-cols-[190px_minmax(0,1fr)]"><div className="relative min-h-48 bg-slate-100"><Image src={getListingCoverUrl(listing)} alt={listing.title} fill priority={index < 4} fetchPriority={index < 4 ? "high" : "auto"} sizes="190px" className="object-cover" /></div><div className="flex flex-col p-5"><span className="w-fit rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{statusLabel(listing.status)}</span><h2 className="mt-3 text-base font-black">{listing.title}</h2><p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin className="size-3.5" />{listing.area}</p><p className="mt-4 text-lg font-black">${listing.price.toLocaleString()} <span className="text-xs text-slate-400">/ 月</span></p><div className="mt-auto flex gap-2 pt-5"><Link href={`/host/listings/${listing.id}`} className="secondary-action"><Pencil className="size-3.5" />管理</Link>{listing.status === "APPROVED" ? <Link href={`/listing/${listing.id}`} className="secondary-action" aria-label="查看公开房源"><Eye className="size-3.5" /></Link> : null}</div></div></article>)}</div>
  </HostPage>;
}

export function HostApplicationsExperience() {
  const token = useAuthSessionToken();
  return <HostApplicationsExperienceSession key={token ?? "guest"} />;
}

function HostApplicationsExperienceSession() {
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
    const reason = decision === "reject" ? window.prompt("请输入拒绝原因")?.trim() : undefined;
    if (decision === "reject" && !reason) return;
    if (!window.confirm(decision === "accept" ? "确认接受这份申请？" : "确认拒绝这份申请？")) return;
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
    {!session.token ? <LoginGate text="登录后读取真实申请" returnTo="/host/applications" /> : null}
    {loadError || session.error ? <ErrorNotice text={loadError ?? session.error!} /> : null}
    {session.token && (session.loading || loading) ? <p role="status" className="mt-6 text-sm font-bold text-slate-500">正在加载申请…</p> : null}
    {session.user && !loading && applications.length === 0 && !loadError && !session.error ? <EmptyState text="暂时没有租房申请。" /> : null}
    <fieldset disabled={loading || session.loading || Boolean(pendingId)} className="mt-6 grid min-w-0 gap-4" aria-label="申请列表">{applications.map((application) => {
      const presentation = getHostApplicationPresentation(application.status);
      return <article key={application.id} className="min-w-0 [overflow-wrap:anywhere] rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-black">{application.listingTitle ?? "房源申请"}</h2><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black">{presentation.statusLabel}</span></div><p className="mt-2 text-sm text-slate-500">{application.memberSnapshots.map((item) => item.displayName).join("、") || "个人申请"} · {application.moveIn.slice(0,10)} 至 {application.moveOut.slice(0,10)}</p><p className="mt-3 text-sm font-bold">{application.schoolOrOccupation}</p>{application.contactName || application.contactEmail ? <p className="mt-2 text-sm text-slate-600">联系人：{[application.contactName, application.contactEmail].filter(Boolean).join(" · ")}</p> : null}<HostApplicationFacts application={application} />{application.note ? <p className="mt-3 whitespace-pre-wrap rounded-[16px] bg-slate-50 p-4 text-sm leading-6 text-slate-600">{application.note}</p> : null}</div><div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">{application.status === "SUBMITTED" ? <><button disabled={Boolean(pendingId) || loading || session.loading || Boolean(session.error)} onClick={() => void decide(application, "accept")} className="primary-action">{pendingId === application.id ? "正在处理…" : "接受申请"}</button><button disabled={Boolean(pendingId) || loading || session.loading || Boolean(session.error)} onClick={() => void decide(application, "reject")} className="secondary-action text-red-600">不通过</button></> : null}<Link href={`/inbox?${new URLSearchParams({ listingId: application.listingId, applicantId: application.submitterId }).toString()}`} className="secondary-action"><MessageCircle className="size-4" />{presentation.contactLabel}</Link></div></div>{decisionError?.id === application.id ? <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{decisionError.message}</p> : null}{notice?.id === application.id ? <p role="status" className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{notice.message}</p> : null}{session.token && session.user ? <ApplicationCancellation application={application} token={session.token} currentUserId={session.user.id} onApplicationChange={applyApplication} /> : null}{session.token && session.user && (application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" || application.status === "CANCELLED") ? <div className="mt-5"><PaymentPanel application={application} token={session.token} currentUserId={session.user.id} onApplicationChange={applyApplication} /></div> : null}</article>;
    })}</fieldset>
  </HostPage>;
}

function HostApplicationFacts({ application }: { application: ApiRentalApplication }) {
  const income = { BELOW_2X: "低于月租 2 倍", TWO_TO_THREE_X: "月租 2–3 倍", THREE_TO_FOUR_X: "月租 3–4 倍", ABOVE_FOUR_X: "高于月租 4 倍", PREFER_NOT_TO_SAY: "不愿透露" }[application.incomeBand];
  const guarantor = { AVAILABLE: "可提供", NOT_AVAILABLE: "无法提供", NOT_NEEDED: "不需要" }[application.guarantorStatus];
  return <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 text-sm">
    <div><dt className="text-xs text-slate-500">收入区间</dt><dd className="mt-1 font-bold">{income}</dd></div>
    <div><dt className="text-xs text-slate-500">担保人</dt><dd className="mt-1 font-bold">{guarantor}</dd></div>
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
    {!session.token ? <LoginGate text="登录房东账户后继续" returnTo={listingId ? `/host/listings/${listingId}` : "/host/listings/new"} /> : null}
    {session.profile && !["lister", "both"].includes(session.profile.role) ? <RoleGate /> : null}
    {session.error ? <><ErrorNotice text={session.error} /><button type="button" onClick={session.reload} className="secondary-action mt-4">重新加载账户</button></> : null}
    {session.token && (session.loading || (canEdit && loadingListing)) ? <p role="status" className="mt-6 text-sm font-bold text-slate-500">正在加载房源…</p> : null}
    {canEdit && loadError ? <><ErrorNotice text={loadError} /><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="secondary-action mt-4">重新加载房源</button></> : null}
    {canEdit && listingId && !loadingListing && !loadError && !listing ? <section className="mt-6 rounded-[24px] border border-slate-200 bg-white p-6"><p className="text-sm font-bold text-slate-600">未找到这套房源，或你没有管理权限。</p><Link href="/host/listings" className="primary-action mt-5">返回我的房源</Link></section> : null}
    {message ? <p className="mt-5 rounded-[16px] bg-blue-50 p-4 text-sm font-bold text-blue-800">{message}</p> : null}
    {session.token && canEdit && !loadingListing && !loadError && (!listingId || listing) ? <div className="mt-6"><PublishingFlow initialDraft={listing ? mapApiListingToPublishDraft(listing) : null} isPublishing={publishing} token={session.token} onSave={save} /></div> : null}
  </HostPage>;
}

function HostPage({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) { return <main className="min-h-dvh bg-[#f4f6f9] p-4 sm:p-6 lg:p-8 xl:p-10"><div className="mx-auto max-w-[1380px]"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-[#0668e1]">Host workspace</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-5xl">{title}</h1><p className="mt-3 text-sm text-slate-500">{description}</p></div>{action}</header>{children}</div></main>; }
function LoginGate({ text, returnTo }: { text: string; returnTo: string }) { return <section className="mt-6 rounded-[24px] border border-dashed border-blue-200 bg-white p-8 text-center"><h2 className="text-xl font-black">{text}</h2><Link href={authRoute({ returnTo })} className="primary-action mt-5">登录</Link></section>; }
function ErrorNotice({ text }: { text: string }) { return <p role="alert" className="mt-6 rounded-[16px] bg-red-50 p-4 text-sm font-bold text-red-700">{text}</p>; }
function EmptyState({ text }: { text: string }) { return <p className="mt-6 rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500">{text}</p>; }
function RoleGate() { return <section className="mt-6 rounded-[20px] border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm font-bold text-slate-500">请先在账户资料中将身份设置为房东或租客兼房东。</p><Link href="/account/profile" className="primary-action mt-5">前往账户资料</Link></section>; }
function Metric({ icon: Icon, label, value, href }: { icon: typeof Building2; label: string; value: string; href: string }) { return <Link href={href} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-[14px] bg-blue-50 text-[#0668e1]"><Icon className="size-5" /></span><p className="mt-5 text-xs font-black text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></Link>; }
function statusKey(status?: ApiListing["status"]) { return status === "DRAFT" || status === "REJECTED" ? "draft" : status === "SUBMITTED" ? "review" : status === "APPROVED" ? "published" : "rented"; }
function statusLabel(status?: ApiListing["status"]) { return status === "DRAFT" ? "草稿" : status === "SUBMITTED" ? "审核中" : status === "APPROVED" ? "已发布" : status === "REJECTED" ? "已退回" : "已出租"; }

export function getHostApplicationPresentation(status: RentalApplicationStatus) {
  return {
    statusLabel: getRentalApplicationStatusCopy(status).label,
    contactLabel: status === "SUBMITTED" ? "要求补充" : "联系申请人"
  };
}
