"use client";

import { ArrowRight, CheckCircle2, CreditCard, FileSignature, Home, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuthSessionToken } from "@/lib/use-auth-session-token";

import { authRoute } from "@/lib/app-routes";
import { readStoredAuthSession } from "@/lib/auth-session";
import { getMyRentalApplications } from "@/lib/rental-applications";
import type { ApiRentalApplication } from "@/lib/rental-applications";

const stages = [
  { title: "申请已接受", icon: CheckCircle2 },
  { title: "签约", icon: FileSignature },
  { title: "付款", icon: CreditCard },
  { title: "入住", icon: Home }
];

export function TripsExperience() {
  const token = useAuthSessionToken();
  return <TripsSessionExperience key={token ?? "guest"} token={token} />;
}

function TripsSessionExperience({ token }: { token: string | null }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [stays, setStays] = useState<ApiRentalApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setAuthenticated(true);
    setLoading(true);
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    getMyRentalApplications(token)
      .then((items) => { if (isCurrent()) setStays(items.filter((item) => item.status === "ACCEPTED" || item.status === "COMPLETED")); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "租住进度暂时无法加载。"); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]"><div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8"><header className="flex flex-col justify-between gap-5 border-b border-slate-200 pb-8 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[.15em] text-[#0668e1]">Stay progress</p><h1 className="mt-2 text-4xl font-black tracking-[-.055em] sm:text-6xl">我的租住</h1><p className="mt-3 text-sm text-slate-500">已接受申请与后续状态全部来自服务端。</p></div><Link href="/applications" className="secondary-action">查看其他申请<ArrowRight className="size-4" /></Link></header><span className="sr-only">申请已接受 签约 付款 入住</span>{!authenticated ? <section className="mt-8 rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center"><h2 className="text-xl font-black">登录后查看真实租住进度</h2><Link href={authRoute({ returnTo: "/trips" })} className="primary-action mt-5">登录</Link></section> : null}{loading ? <p className="mt-8 text-center text-sm text-slate-500">正在同步租住状态…</p> : null}{error ? <p role="alert" className="mt-8 rounded-[16px] bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}{authenticated && !loading && stays.length === 0 && !error ? <p className="mt-8 rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-500">暂时没有已接受的申请。</p> : null}<div className="mt-8 space-y-6">{stays.map((stay) => <article key={stay.id} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">{stay.status === "COMPLETED" ? "入住已确认" : "申请已接受"}</span><h2 className="mt-4 text-2xl font-black">{stay.listingTitle ?? "租住房源"}</h2><p className="mt-2 text-sm text-slate-500">{stay.moveIn.slice(0,10)} 至 {stay.moveOut.slice(0,10)}</p></div><div className="flex flex-wrap gap-2"><Link href={`/inbox?listingId=${encodeURIComponent(stay.listingId)}`} className="secondary-action h-fit"><MessageCircle className="size-4" />联系房东</Link>{stay.status === "ACCEPTED" ? <Link href={`/applications/${encodeURIComponent(stay.id)}`} className="primary-action h-fit"><CreditCard className="size-4" />继续付款</Link> : null}</div></div><ol className="mt-7 grid gap-3 border-t border-slate-200 pt-6 sm:grid-cols-4">{stages.map((stage, index) => { const Icon = stage.icon; const done = stay.status === "COMPLETED" || index === 0; return <li key={stage.title} className="rounded-[18px] bg-slate-50 p-4"><span className={done ? "text-emerald-600" : "text-slate-400"}><Icon className="size-5" /></span><p className="mt-3 text-sm font-black">{stage.title}</p><p className="mt-1 text-xs text-slate-500">{done ? "已记录" : index === 2 ? "在申请详情中继续" : "等待前序步骤"}</p></li>; })}</ol></article>)}</div></div></main>;
}
