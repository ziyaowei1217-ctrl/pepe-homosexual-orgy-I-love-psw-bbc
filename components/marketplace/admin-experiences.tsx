"use client";

import { ArrowRight, CheckCircle2, FileSearch, IdCard, UsersRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { AdminRoommatesScreen } from "@/components/admin-roommates-screen";
import { AdminStepUpPanel } from "@/components/admin-step-up-panel";
import { AdminTrustScreen } from "@/components/admin-trust-screen";
import { apiGet, getAdminListingReviewQueue, getAdminRoommates } from "@/lib/api";
import type { ApiTrustQueue } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, clearStoredAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { readStoredAdminStepUpSession, writeStoredAdminStepUpSession } from "@/lib/admin-step-up";
import type { AdminStepUpSession } from "@/lib/admin-step-up";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import { useMarketplaceSession } from "@/lib/use-marketplace-session";

export function AdminDashboardExperience() {
  const token = useAuthSessionToken();
  return <AdminDashboardSessionExperience key={token ?? "guest"} />;
}

function AdminDashboardSessionExperience() {
  const session = useMarketplaceSession();
  const [queueCount, setQueueCount] = useState<number | null>(null);
  const [profileCount, setProfileCount] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<ApiTrustQueue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session.token || session.user?.role !== "ADMIN") return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === session.token;
    Promise.all([
      getAdminListingReviewQueue(session.token),
      getAdminRoommates(session.token),
      apiGet<ApiTrustQueue[]>("/trust/queues", session.token)
    ]).then(([queue, profiles, nextMetrics]) => {
      if (!isCurrent()) return;
      setQueueCount(queue.length);
      setProfileCount(profiles.length);
      setMetrics(nextMetrics);
    }).catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "审核概览暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [session.token, session.user?.role]);

  return <AdminPage title="审核概览" description="队列与资料数量来自服务端。" action={<Link href="/admin/trust" className="primary-action">进入审核队列<ArrowRight className="size-4" /></Link>}>
    <span className="sr-only">风险提醒 最近操作</span>
    <AdminAccess session={session} returnTo="/admin" />
    {error ? <ErrorNotice text={error} /> : null}
    <section className="mt-8 grid gap-4 sm:grid-cols-3"><Metric icon={FileSearch} label="待审核房源" value={queueCount} /><Metric icon={IdCard} label="信任指标" value={metrics.reduce((sum, item) => sum + item.value, 0) || null} /><Metric icon={UsersRound} label="室友资料" value={profileCount} /></section>
    <section className="mt-6 rounded-[26px] border border-slate-200 bg-white p-6"><h2 className="text-lg font-black">风险提醒</h2><p className="mt-2 text-sm text-slate-500">具体证据与操作记录仅在信任审核页展示，不生成虚构风险或活动。</p></section>
  </AdminPage>;
}

export function AdminTrustExperience() {
  const token = useAuthSessionToken();
  return <AdminOperationalExperience key={token ?? "guest"} kind="trust" />;
}

export function AdminRoommatesExperience() {
  const token = useAuthSessionToken();
  return <AdminOperationalExperience key={token ?? "guest"} kind="roommates" />;
}

function AdminOperationalExperience({ kind }: { kind: "trust" | "roommates" }) {
  const session = useMarketplaceSession();
  const [stepUpSession, setStepUpSession] = useState<AdminStepUpSession | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!session.user || typeof window === "undefined") return;
    setStepUpSession(readStoredAdminStepUpSession(window.localStorage, session.user));
  }, [session.user]);

  function authenticationError() {
    if (readStoredAuthSession()?.accessToken !== session.token) return;
    clearStoredAuthSession();
    window.location.assign(authRoute({ returnTo: kind === "trust" ? "/admin/trust" : "/admin/roommates" }));
  }

  return <>
    <span className="sr-only">{kind === "trust" ? "信任审核 证据清单 处理理由 通过审核 拒绝并退回" : "室友资料 已展示 已隐藏 编辑资料 归档"}</span>
    <AdminAccess session={session} returnTo={kind === "trust" ? "/admin/trust" : "/admin/roommates"} />
    {session.token && session.user?.role === "ADMIN" && kind === "trust" ? <AdminTrustScreen assertSessionCurrent={() => assertCurrentAuthSession(session.token)} token={session.token} user={session.user} stepUpSession={stepUpSession} onStepUpRequired={() => setStepUpOpen(true)} onCatalogChanged={async () => undefined} onTrustMetricsChanged={async () => undefined} onToast={setToast} onAuthenticationError={() => { authenticationError(); }} /> : null}
    {session.token && session.user?.role === "ADMIN" && kind === "roommates" ? <AdminRoommatesScreen assertSessionCurrent={() => assertCurrentAuthSession(session.token)} token={session.token} user={session.user} stepUpSession={stepUpSession} onStepUpRequired={() => setStepUpOpen(true)} onToast={setToast} onAuthenticationError={() => { authenticationError(); }} /> : null}
    {session.token && session.user ? <AdminStepUpPanel assertSessionCurrent={() => assertCurrentAuthSession(session.token)} open={stepUpOpen} sessionToken={session.token} email={session.user.email} onCancel={() => setStepUpOpen(false)} onVerified={(verified) => { assertCurrentAuthSession(session.token); setStepUpSession(verified); writeStoredAdminStepUpSession(window.localStorage, session.user!, verified); setStepUpOpen(false); setToast("管理员验证已完成。"); }} /> : null}
    {toast ? <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-xl">{toast}</div> : null}
  </>;
}

function AdminAccess({ session, returnTo }: { session: ReturnType<typeof useMarketplaceSession>; returnTo: string }) {
  if (session.token && session.user?.role === "ADMIN") return null;
  if (session.token && session.loading) return <p className="m-8 text-center text-sm text-slate-500">正在确认管理员权限…</p>;
  return <section className="m-8 rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-black">{session.token ? "此账户没有管理员权限" : "登录管理员账户后继续"}</h2>{!session.token ? <Link href={authRoute({ returnTo })} className="primary-action mt-5">登录</Link> : null}</section>;
}

function AdminPage({ title, description, action, children }: { title: string; description: string; action?: React.ReactNode; children: React.ReactNode }) { return <main className="mx-auto max-w-[1460px] px-4 py-7 sm:px-7 lg:px-10"><header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.16em] text-blue-700">Operations</p><h1 className="mt-2 text-4xl font-black">{title}</h1><p className="mt-3 text-sm text-slate-500">{description}</p></div>{action}</header>{children}</main>; }
function Metric({ icon: Icon, label, value }: { icon: typeof CheckCircle2; label: string; value: number | null }) { return <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"><span className="grid size-10 place-items-center rounded-[13px] bg-blue-50 text-blue-700"><Icon className="size-5" /></span><strong className="mt-5 block text-3xl font-black">{value ?? "—"}</strong><span className="mt-1 block text-sm font-bold text-slate-600">{label}</span></div>; }
function ErrorNotice({ text }: { text: string }) { return <p role="alert" className="mt-6 rounded-[16px] bg-red-50 p-4 text-sm font-bold text-red-700">{text}</p>; }
