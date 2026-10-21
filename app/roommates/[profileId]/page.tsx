import type { Metadata } from "next";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PublicShell } from "@/components/marketplace/public-shell";
import { apiGet } from "@/lib/api";
import type { ApiRoommate } from "@/lib/api";
import { getRoommateActionTargetId } from "@/lib/roommate-deck-client";

export const metadata: Metadata = { title: "室友资料" };

export default async function RoommateProfilePage({ params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  let profile: ApiRoommate;
  try {
    profile = await apiGet<ApiRoommate>(`/roommates/deck/${encodeURIComponent(profileId)}`);
  } catch {
    notFound();
  }

  const reasons = profile.reasons ?? profile.recommendation?.primarySignals ?? [];
  const actionTargetId = getRoommateActionTargetId(profile) ?? profileId;
  return <PublicShell active="roommates"><main className="min-h-[calc(100dvh-72px)] bg-surface-subtle px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><Link href="/roommates" className="text-sm font-black text-ink-secondary">← 返回室友匹配</Link><section className="mt-5 overflow-hidden rounded-[30px] border border-line-strong bg-surface shadow-xl"><div className="grid lg:grid-cols-[0.85fr_1.15fr]"><div className="relative min-h-[430px] bg-line-strong lg:min-h-[690px]"><SmartImage src={profile.image} alt={profile.name} fill sizes="(max-width:1024px) 100vw, 42vw" className="object-cover" /></div><div className="p-6 sm:p-9 lg:p-12"><h1 className="text-4xl font-black tracking-[-0.01em] sm:text-5xl">{profile.name}, {profile.age}</h1><p className="mt-2 text-sm font-semibold text-ink-secondary">{profile.role}</p><div className="mt-7 rounded-[22px] bg-surface-subtle p-5"><p className="text-xs font-black uppercase tracking-[0.13em] text-primary-text">{profile.compatibilityScore ?? profile.match}% 匹配 · 为什么适合你</p>{reasons.length ? <ul className="mt-4 space-y-3 text-sm text-ink">{reasons.map((reason) => <li key={reason}>✓ {reason}</li>)}</ul> : <p className="mt-3 text-sm text-ink">完善双方资料后会显示更具体的匹配依据。</p>}</div><div className="mt-8 grid gap-4 sm:grid-cols-2"><Info label="预算" value={profile.budget} /><Info label="偏好地点" value={profile.commute} /></div><div className="mt-8 border-t border-line-strong pt-7"><h2 className="text-xl font-black">生活标签</h2><div className="mt-3 flex flex-wrap gap-2">{profile.tags.map((tag) => <span key={tag} className="rounded-full bg-tag-neutral px-3 py-1.5 text-xs font-bold">{tag}</span>)}</div></div><div className="mt-8 flex gap-3"><Link href={`/inbox?roommateId=${encodeURIComponent(actionTargetId)}`} className="primary-action">打开匹配对话</Link><Link href="/roommates" className="secondary-action">继续浏览</Link></div></div></div></section></div></main></PublicShell>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-psw-lg bg-surface-muted p-4"><p className="text-m-footnote font-semibold text-ink-secondary">{label}</p><p className="mt-1 text-d-label text-ink">{value}</p></div>; }
