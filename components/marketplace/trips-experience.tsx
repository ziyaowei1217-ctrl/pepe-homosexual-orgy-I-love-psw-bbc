"use client";

import { ArrowRight, CheckCircle2, CreditCard, FileSignature, Home, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";
import { formatRangeLong } from "@/lib/date-format";
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

  return <main className="min-h-[calc(100dvh-72px)] bg-background"><div className="page-container pb-16 pt-8 sm:pt-12">
    <PageHeader title="我的租住" description="申请被接受后，签约、付款和入住都在这里跟进。" action={authenticated ? <Link href="/applications" className="secondary-action">查看其他申请<ArrowRight className="size-4" aria-hidden="true" /></Link> : undefined} />
    <span className="sr-only">申请已接受 签约 付款 入住</span>
    {!authenticated ? <EmptyState className="mt-8" mood="default" title="登录后查看你的租住进度" body="用邮箱验证码登录，就能看到已接受的申请和下一步要做的事。" action={<Link href={authRoute({ returnTo: "/trips" })} className="primary-action">登录</Link>} /> : null}
    {loading ? <p className="mt-8 text-center text-d-subhead text-ink-secondary">正在同步租住状态…</p> : null}
    {error ? <p role="alert" className="mt-8 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{error}</p> : null}
    {authenticated && !loading && stays.length === 0 && !error ? <EmptyState className="mt-8" mood="sleepy" title="暂时没有已接受的申请" body="转租人接受你的申请后，租住进度会出现在这里。" action={<Link href="/search" className="primary-action">去找房</Link>} /> : null}
    <div className="mt-8 space-y-6">{stays.map((stay) => <article key={stay.id} className="rounded-psw-xl bg-surface p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row"><div><span className="rounded-psw-sm bg-primary-soft px-2.5 py-1 text-m-footnote font-bold text-primary-text">{stay.status === "COMPLETED" ? "入住已确认" : "申请已接受"}</span><h2 className="mt-4 text-m-title sm:text-d-title">{stay.listingTitle ?? "租住房源"}</h2><p className="mt-2 text-d-subhead text-ink-secondary">{formatRangeLong(stay.moveIn.slice(0, 10), stay.moveOut.slice(0, 10))}</p></div><div className="flex flex-wrap gap-2"><Link href={`/inbox?listingId=${encodeURIComponent(stay.listingId)}`} className="secondary-action h-fit"><MessageCircle className="size-4" aria-hidden="true" />联系转租人</Link>{stay.status === "ACCEPTED" ? <Link href={`/applications/${encodeURIComponent(stay.id)}`} className="primary-action h-fit"><CreditCard className="size-4" aria-hidden="true" />继续付款</Link> : null}</div></div><ol className="mt-7 grid gap-3 border-t border-line-strong pt-6 sm:grid-cols-4">{stages.map((stage, index) => { const Icon = stage.icon; const done = stay.status === "COMPLETED" || index === 0; return <li key={stage.title} className="rounded-psw-lg bg-surface-muted p-4"><span className={done ? "text-primary-text" : "text-ink-disabled"}><Icon className="size-5" aria-hidden="true" /></span><p className="mt-3 text-d-label">{stage.title}</p><p className="mt-1 text-m-footnote text-ink-secondary">{done ? "已记录" : index === 2 ? "在申请详情中继续" : "等待前序步骤"}</p></li>; })}</ol></article>)}</div>
  </div></main>;
}
