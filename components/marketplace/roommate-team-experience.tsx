"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { useAuthSessionToken } from "@/lib/use-auth-session-token";

import { authRoute } from "@/lib/app-routes";
import { getSessionUser } from "@/lib/api";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import {
  acceptRoommateTeamInvite,
  cancelRoommateTeamInvite,
  declineRoommateTeamInvite,
  getRoommateTeamState,
  leaveRoommateTeam
} from "@/lib/roommate-teams";
import type { ApiRoommateTeam, ApiRoommateTeamInvite } from "@/lib/roommate-teams";

export function RoommateTeamExperience() {
  const token = useAuthSessionToken();
  return <RoommateTeamSessionExperience key={token ?? "guest"} token={token} />;
}

function RoommateTeamSessionExperience({ token }: { token: string | null }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [team, setTeam] = useState<ApiRoommateTeam | null>(null);
  const [invites, setInvites] = useState<ApiRoommateTeamInvite[]>([]);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async (accessToken: string) => {
    assertCurrentAuthSession(accessToken);
    const [state, user] = await Promise.all([getRoommateTeamState(accessToken), getSessionUser(accessToken)]);
    assertCurrentAuthSession(accessToken);
    setUserId(user.id);
    setTeam(state.team);
    setInvites(state.invites.filter((item) => item.status === "PENDING"));
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    setLoading(true);
    setError(null);
    load(token)
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "小组暂时无法加载。"); })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, token, loadAttempt]);

  async function run(command: (accessToken: string) => Promise<unknown>) {
    if (!token || pending) return;
    setPending(true);
    setError(null);
    try { assertCurrentAuthSession(token); await command(token); assertCurrentAuthSession(token); await load(token); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失败，请重试。"); }
    finally { setPending(false); }
  }

  function confirmLeave() {
    if (!team || pending || loading) return;
    if (!window.confirm("退出后小组将解散，待审核的小组申请会自动撤回。确定退出吗？")) return;
    void run((value) => leaveRoommateTeam(value, team.id));
  }

  return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
    <div className="mx-auto max-w-5xl">
      <header className="border-b border-slate-200 pb-6">
        <p className="text-xs font-black uppercase tracking-[.14em] text-[#0668e1]">Co-rent team</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-5xl">合租小组</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">查看组队邀请和成员，找到合拍的室友后一起找房。</p>
      </header>
      {!token ? <section className="mt-7 rounded-[26px] border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-xl font-black">登录后查看小组</h2><Link href={authRoute({ returnTo: "/roommates/teams" })} className="primary-action mt-5">登录</Link></section> : null}
      {loading ? <p role="status" className="mt-7 rounded-[24px] border border-slate-200 bg-white p-6 text-sm text-slate-500">正在加载小组和邀请…</p> : null}
      {error ? <div className="mt-6 rounded-[16px] bg-red-50 p-4"><p role="alert" className="text-sm font-bold text-red-700">{error}</p><button type="button" disabled={loading || pending} onClick={() => setLoadAttempt((value) => value + 1)} className="mt-3 text-sm font-bold text-red-700 underline underline-offset-4">重新加载</button></div> : null}
      {team ? <section className="mt-7 rounded-[26px] border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-black">已确认小组</h2>
        <p className="mt-2 text-sm text-slate-500">{team.members.filter((item) => item.active).length} 位成员 · {team.status === "ACTIVE" ? "进行中" : "已解散"}</p>
        <ul aria-label="小组成员" className="mt-5 divide-y divide-slate-100">{team.members.filter((item) => item.active).map((member) => <li key={member.id} className="flex items-center justify-between gap-3 py-3 text-sm font-bold"><span className="min-w-0 [overflow-wrap:anywhere]">{typeof member.snapshot.name === "string" ? member.snapshot.name : "小组成员"}</span>{member.userId === userId ? <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">你</span> : null}</li>)}</ul>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/search?groupTour=1" className="primary-action">一起找房</Link><Link href="/inbox" className="secondary-action">小组相关消息</Link>{team.status === "ACTIVE" ? <button disabled={pending || loading} onClick={confirmLeave} className="secondary-action text-red-600">退出小组</button> : null}</div>
      </section> : null}
      {token && !loading && !error && !team && invites.length === 0 ? <section className="mt-7 rounded-[24px] border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm font-bold leading-6 text-slate-500">暂无小组或待处理邀请。双方匹配后可发起邀请。</p><Link href="/roommates/likes" className="secondary-action mt-5">查看喜欢与匹配</Link></section> : null}
      {invites.length ? <section className="mt-7"><h2 className="text-lg font-black">待处理邀请</h2><div className="mt-3 space-y-3">{invites.map((invite) => {
        const outgoing = invite.inviterId === userId;
        return <article key={invite.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-slate-200 bg-white p-5"><p className="text-sm font-bold">小组邀请 · {outgoing ? "我发出" : "待确认"}</p><div className="flex gap-2">{!outgoing ? <button disabled={pending || loading} onClick={() => void run((value) => acceptRoommateTeamInvite(value, invite.id))} className="primary-action">接受</button> : null}<button disabled={pending || loading} onClick={() => void run((value) => outgoing ? cancelRoommateTeamInvite(value, invite.id) : declineRoommateTeamInvite(value, invite.id))} className="secondary-action">{outgoing ? "取消" : "拒绝"}</button></div></article>;
      })}</div></section> : null}
    </div>
  </main>;
}
