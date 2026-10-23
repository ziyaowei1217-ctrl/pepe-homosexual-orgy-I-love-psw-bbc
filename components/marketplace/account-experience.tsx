"use client";

import {
  Bell,
  ChevronRight,
  FileCheck2,
  Heart,
  IdCard,
  LockKeyhole,
  LogOut,
  Mail,
  Settings2,
  ShieldCheck,
  UserRound
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { PageHeader } from "@/components/marketplace/page-header";
import { GoogleSignIn } from "@/components/marketplace/google-sign-in";
import { endGoogleSession, usesNeonAuth } from "@/lib/neon-auth-client";
import {
  getMyProfile,
  getSessionUser,
  requestEmailCode,
  updateMyProfile,
  verifyEmailCode,
  type ApiProfile,
  type SessionUser,
  type UpdateProfileInput
} from "@/lib/api";
import { assertCurrentAuthSession, clearStoredAuthSession, readStoredAuthSession, writeStoredAuthSession } from "@/lib/auth-session";
import { normalizeAuthEmail, normalizeVerificationCode } from "@/lib/auth-flow";
import type { AuthIntent } from "@/lib/app-routes";
import { buildProfileUpdateInput } from "@/lib/profile-input";
import { getMyRentalApplications, type ApiRentalApplication } from "@/lib/rental-applications";
import { cn } from "@/lib/utils";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";

export type AccountMode = "overview" | "profile" | "verification" | "settings";

const accountNav = [
  { mode: "overview", label: "账户首页", mobileLabel: "首页", href: "/account", icon: UserRound },
  { mode: "profile", label: "个人资料", mobileLabel: "资料", href: "/account/profile", icon: IdCard },
  { mode: "verification", label: "身份与认证", mobileLabel: "认证", href: "/account/verification", icon: ShieldCheck },
  { mode: "settings", label: "通知与隐私", mobileLabel: "设置", href: "/account/settings", icon: Settings2 }
] as const;

type AccountExperienceProps = { mode: AccountMode; returnTo?: string | null; authIntent?: AuthIntent };

export function AccountExperience(props: AccountExperienceProps) {
  const token = useAuthSessionToken();
  // Keep provider-logout feedback outside the keyed private account view.
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const logoutBusy = useRef(false);

  async function finishProviderLogout() {
    if (logoutBusy.current) return;
    logoutBusy.current = true;
    setLogoutPending(true);
    setLogoutError(null);
    try { await endGoogleSession(); }
    catch {
      if (!readStoredAuthSession()?.accessToken) setLogoutError("已退出此设备，但登录服务尚未完成退出。请重试结束登录会话。");
    } finally { logoutBusy.current = false; setLogoutPending(false); }
  }

  function logout() {
    if (!token || logoutBusy.current || readStoredAuthSession()?.accessToken !== token) return;
    // Removing this device's private session must never depend on an upstream service.
    clearStoredAuthSession();
    void finishProviderLogout();
  }

  function retryProviderLogout() {
    if (!readStoredAuthSession()?.accessToken) void finishProviderLogout();
  }

  return <AccountSessionExperience key={token ?? "guest"} {...props} token={token} logoutError={token ? null : logoutError} logoutPending={logoutPending} onLogout={logout} onRetryProviderLogout={retryProviderLogout} />;
}

function AccountSessionExperience({ mode, returnTo = null, authIntent = "account", token, logoutError, logoutPending, onLogout, onRetryProviderLogout }: AccountExperienceProps & {
  token: string | null; logoutError: string | null; logoutPending: boolean; onLogout: () => void; onRetryProviderLogout: () => void;
}) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [profile, setProfile] = useState<ApiProfile | null>(null);
  const [applications, setApplications] = useState<ApiRentalApplication[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    Promise.all([
      getSessionUser(token),
      getMyProfile(token),
      getMyRentalApplications(token).catch(() => null)
    ])
      .then(([nextUser, nextProfile, nextApplications]) => {
        if (!isCurrent()) return;
        setUser(nextUser); setProfile(nextProfile); setApplications(nextApplications);
      })
      .catch((caught) => {
        if (!isCurrent()) return;
        if (caught instanceof Error && "status" in caught && caught.status === 401) {
          clearStoredAuthSession();
        } else {
          setLoadError("账户资料暂时无法加载，请重试。");
        }
      })
      .finally(() => { if (isCurrent()) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, loadAttempt]);

  function handleAuthenticated(accessToken: string) {
    if ((readStoredAuthSession()?.accessToken ?? null) !== token) return;
    writeStoredAuthSession(accessToken);
    if (returnTo && typeof window !== "undefined") window.location.assign(returnTo);
  }

  const authenticated = Boolean(token && user);
  return (
    <main className="page-container pb-16 pt-8 sm:pt-12">
      <PageHeader title="我的账户" description="更新个人资料，查看认证状态、申请和消息。" />
      {logoutError ? <div role="alert" className="mt-4 text-danger-text"><p>{logoutError}</p><button type="button" disabled={logoutPending} onClick={onRetryProviderLogout} className="secondary-action mt-3">重试结束登录会话</button></div> : null}
      {logoutPending && !token ? <p role="status" className="mt-4 text-ink-secondary">已退出此设备，正在结束登录会话…</p> : null}
      {notice ? <div role="status" className="mt-5 rounded-psw-md bg-success-soft px-4 py-3 text-d-subhead font-semibold text-success-text">{notice}</div> : null}
      <div className="mt-5 grid items-start gap-4 lg:mt-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6">
        <aside className="flex min-w-0 items-center overflow-hidden rounded-psw-lg bg-surface p-1 lg:block lg:rounded-psw-xl lg:p-2">
          <div className="hidden items-center gap-3 p-3 lg:flex"><span className="grid size-11 place-items-center rounded-full bg-surface-subtle text-primary-text"><UserRound className="size-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-bold">{user?.email ?? "访客账户"}</span><span className="mt-0.5 block text-m-footnote text-ink-secondary">{authenticated ? "账户已连接" : loading ? "正在检查登录状态" : "登录后同步进度"}</span></span></div>
          <nav className="grid min-w-0 flex-1 grid-cols-4 lg:mt-2 lg:block lg:space-y-1" aria-label="账户导航">
            {accountNav.map((item) => {
              const Icon = item.icon;
              return <Link key={item.mode} href={item.href} aria-label={item.label} aria-current={mode === item.mode ? "page" : undefined} className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-psw-md px-1 text-[15px] font-bold text-ink-secondary hover:bg-surface-subtle sm:text-sm lg:justify-start lg:gap-3 lg:px-3 lg:py-3", mode === item.mode && "bg-primary-soft text-primary-text hover:bg-primary-soft")}>
                <Icon className="size-4 shrink-0" aria-hidden="true" /><span className="lg:hidden">{item.mobileLabel}</span><span className="hidden lg:inline">{item.label}</span><ChevronRight className="ml-auto hidden size-4 opacity-40 lg:block" aria-hidden="true" />
              </Link>;
            })}
          </nav>
          {token ? <button onClick={onLogout} disabled={logoutPending} aria-label="退出登录" className="ml-1 flex size-11 shrink-0 items-center justify-center rounded-psw-md text-sm font-bold text-ink-secondary hover:bg-surface-subtle lg:ml-0 lg:mt-2 lg:h-auto lg:w-full lg:justify-start lg:gap-3 lg:px-3 lg:py-3"><LogOut className="size-4" aria-hidden="true" /><span className="hidden lg:inline">退出登录</span></button> : null}
        </aside>

        {authenticated && token && user ? <AuthenticatedAccount mode={mode} token={token} user={user} profile={profile} applications={applications} onProfileChange={setProfile} onNotice={setNotice} />
          : token ? <section className="rounded-psw-xl bg-surface p-6 sm:p-8">{loading ? <p role="status" className="text-d-subhead text-ink-secondary">正在加载账户资料…</p> : <><p role="alert" className="text-d-subhead font-semibold text-danger-text">{loadError}</p><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="primary-action mt-4">重新加载账户</button></>}</section>
          : <GuestAccount mode={mode} returnTo={returnTo} authIntent={authIntent} onAuthenticated={handleAuthenticated} signInDisabled={logoutPending} />}
      </div>
    </main>
  );
}

function GuestAccount({ mode, returnTo, authIntent, onAuthenticated, signInDisabled }: { mode: AccountMode; returnTo: string | null; authIntent: AuthIntent; onAuthenticated: (token: string, user: SessionUser) => void; signInDisabled: boolean }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [developmentHint, setDevelopmentHint] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !mounted.current) return;
    setError(null);
    const normalized = normalizeAuthEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) { setError("请输入有效的邮箱地址。"); return; }
    busy.current = true;
    setPending(true);
    try {
      const response = await requestEmailCode(normalized);
      if (!mounted.current) return;
      setEmail(response.email); setCode(response.devCode ?? ""); setDevelopmentHint(response.devCode ? "本地开发验证码已自动填入。" : null); setStep("code");
    }
    catch { if (mounted.current) setError("暂时无法发送验证码，请稍后再试。"); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !mounted.current) return;
    setError(null);
    const normalized = normalizeVerificationCode(code);
    if (normalized.length !== 6) { setError("请输入六位验证码。"); return; }
    busy.current = true;
    setPending(true);
    try {
      const response = await verifyEmailCode(email, normalized);
      if (mounted.current) onAuthenticated(response.accessToken, response.user);
    }
    catch { if (mounted.current) setError("验证码无效或已过期，请重新尝试。"); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  const sectionLabel = mode === "profile" ? "个人资料" : mode === "verification" ? "身份与认证" : mode === "settings" ? "通知与隐私" : "账户首页";
  const resumingApplication = authIntent === "application" && returnTo?.startsWith("/applications/new");
  if (usesNeonAuth()) return <section className="grid overflow-hidden rounded-psw-xl bg-surface xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="p-5 sm:p-9"><span className="inline-flex items-center gap-1.5 rounded-psw-sm bg-primary-soft px-2.5 py-1 text-m-footnote font-bold text-primary-text"><LockKeyhole className="size-3.5" aria-hidden="true" />{sectionLabel}</span>
      <h2 className="mt-4 font-rounded text-m-title sm:mt-6 sm:text-d-title">{resumingApplication ? "登录后继续申请" : "登录 psw"}</h2>
      <p className="mt-3 max-w-lg text-sm leading-6 text-ink-secondary">{resumingApplication ? "申请尚未提交。登录后会返回申请页面，继续确认和提交。" : "使用 Google 账户登录，查看申请、消息和租住进度。"}</p>
      <GoogleSignIn returnTo={returnTo} disabled={signInDisabled} />
      <div className="mt-6 flex items-center gap-2 text-m-footnote font-bold text-ink-secondary"><ShieldCheck className="size-4 text-primary-text" aria-hidden="true" />psw 不会接收你的 Google 密码</div>
    </div>
    <div className="border-t border-line-strong bg-primary-soft p-6 sm:p-8 xl:border-l xl:border-t-0"><h3 className="text-d-label text-primary-text">登录后可以</h3><div className="mt-6 space-y-5"><Benefit icon={Heart} title="查看找房进度" detail="申请状态与已接受租住" /><Benefit icon={Mail} title="集中处理消息" detail="转租人、预约与室友对话" /><Benefit icon={FileCheck2} title="提高信任度" detail="完善资料与身份认证" /></div></div>
  </section>;
  return <section className="grid overflow-hidden rounded-psw-xl bg-surface xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="p-5 sm:p-9"><span className="inline-flex items-center gap-1.5 rounded-psw-sm bg-primary-soft px-2.5 py-1 text-m-footnote font-bold text-primary-text"><LockKeyhole className="size-3.5" aria-hidden="true" />{sectionLabel}</span><h2 className="mt-4 font-rounded text-m-title text-ink sm:mt-6 sm:text-d-title">{resumingApplication ? "登录后继续申请" : "登录 psw"}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-ink-secondary sm:mt-3">{resumingApplication ? "申请尚未提交。登录后会返回申请页面，继续确认和提交。" : "使用邮箱验证码登录，查看申请、消息和租住进度。"}</p><p className="mt-3 rounded-psw-md bg-surface-subtle px-3 py-2 text-m-footnote leading-5 text-ink">目前仅支持受邀邮箱或已有账户。请使用收到邀请的邮箱登录。</p>{resumingApplication && returnTo ? <Link href={returnTo} className="mt-3 inline-flex min-h-10 items-center text-sm font-bold text-primary-text underline underline-offset-4">返回申请</Link> : null}{step === "email" ? <form className="mt-5 max-w-md sm:mt-8" onSubmit={submitEmail}><label className="text-sm font-bold" htmlFor="account-email">邮箱地址</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="account-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" className="application-input flex-none sm:flex-1" /><button disabled={pending} className="h-12 shrink-0 rounded-full bg-primary px-5 font-rounded text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-60">{pending ? "发送中…" : "发送验证码"}</button></div></form> : <form className="mt-5 max-w-md sm:mt-8" onSubmit={submitCode}><label className="text-sm font-bold" htmlFor="account-code">验证码</label><p className="mt-2 text-m-footnote leading-5 text-ink-secondary">若 {email} 已获邀或已有账户，验证码会发送至该邮箱。未收到时请检查垃圾邮件或修改邮箱后重试。</p><input id="account-code" inputMode="numeric" value={code} maxLength={6} onChange={(event) => setCode(normalizeVerificationCode(event.target.value))} placeholder="六位验证码" className="application-input mt-2" />{developmentHint ? <p className="mt-2 text-m-footnote font-bold text-primary-text">{developmentHint}</p> : null}<div className="mt-3 flex gap-3"><button disabled={pending} className="h-12 rounded-full bg-primary px-5 font-rounded text-sm font-bold text-white hover:bg-primary-hover">{pending ? "验证中…" : "验证并登录"}</button><button type="button" disabled={pending} onClick={() => { if (!busy.current) setStep("email"); }} className="px-3 text-sm font-bold text-ink-secondary">修改邮箱</button></div></form>}{error ? <p role="alert" className="mt-3 text-sm font-bold text-danger-text">{error}</p> : null}<div className="mt-5 flex items-center gap-2 text-m-footnote font-bold text-ink-secondary sm:mt-8"><ShieldCheck className="size-4 text-primary-text" />无需密码，验证码短时有效</div></div>
    <div className="border-t border-line-strong bg-primary-soft p-6 sm:p-8 xl:border-l xl:border-t-0"><h3 className="text-d-label text-primary-text">登录后可以</h3><div className="mt-6 space-y-5"><Benefit icon={Heart} title="查看找房进度" detail="申请状态与已接受租住" /><Benefit icon={Mail} title="集中处理消息" detail="转租人、预约与室友对话" /><Benefit icon={FileCheck2} title="提高信任度" detail="完善资料与身份认证" /></div></div>
  </section>;
}

function AuthenticatedAccount({ mode, token, user, profile, applications, onProfileChange, onNotice }: { mode: AccountMode; token: string; user: SessionUser; profile: ApiProfile | null; applications: ApiRentalApplication[] | null; onProfileChange: (profile: ApiProfile) => void; onNotice: (message: string) => void }) {
  if (mode === "profile") return <ProfileEditor token={token} profile={profile} onProfileChange={onProfileChange} onNotice={onNotice} />;
  if (mode === "verification") return <VerificationPanel profile={profile} />;
  if (mode === "settings") return <SettingsPanel />;
  const activeApplications = applications?.filter((application) => application.status === "DRAFT" || application.status === "SUBMITTED").length;
  const acceptedApplications = applications?.filter((application) => application.status === "ACCEPTED" || application.status === "COMPLETED").length;
  const profileFields = [
    { label: "显示名称", value: profile?.displayName },
    { label: "学校或公司", value: profile?.school },
    { label: "城市", value: profile?.city },
    { label: "个人简介", value: profile?.bio }
  ];
  const missingFields = profileFields.filter((field) => !field.value?.trim());
  const completion = Math.round((profileFields.length - missingFields.length) / profileFields.length * 100);
  return <section className="min-w-0 space-y-6">
    <div className="rounded-psw-xl bg-surface p-7 sm:p-9">
      <h2 className="break-words text-m-title sm:text-d-title">你好，{profile?.displayName || user.email.split("@")[0]}</h2>
      <p className="mt-2 text-m-subhead text-ink-secondary sm:text-d-subhead">{missingFields.length ? `还可以补充：${missingFields.map((field) => field.label).join("、")}。` : "个人资料已完善，你可以随时更新。"}</p>
      {/* A progress bar only while something is missing; a full bar says nothing. */}
      {completion < 100 ? <div role="progressbar" aria-label="资料完成度" aria-valuenow={completion} aria-valuemin={0} aria-valuemax={100} className="mt-6 h-2 overflow-hidden rounded-full bg-primary-soft">
        <div className="h-full rounded-full bg-primary" style={{ width: `${completion}%` }} />
      </div> : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {completion < 100 ? <p className="text-m-footnote font-semibold text-ink-secondary">资料完成度 {completion}%</p> : null}
        <Link href="/account/profile" className="secondary-action">{completion === 100 ? "编辑资料" : "完善资料"}<ChevronRight className="size-4" aria-hidden="true" /></Link>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><QuickLink href="/applications" title="我的申请" detail={activeApplications === undefined ? "暂时无法读取" : `${activeApplications} 个进行中`} /><QuickLink href="/trips" title="租住进度" detail={acceptedApplications === undefined ? "暂时无法读取" : `${acceptedApplications} 个已接受`} /><QuickLink href="/saved" title="收藏清单" detail="保存在这台设备上" />{profile && ["lister", "both"].includes(profile.role) ? <QuickLink href="/host" title="我发布的房间" detail="申请、看房和房源状态" /> : null}</div>
  </section>;
}

function ProfileEditor({ token, profile, onProfileChange, onNotice }: { token: string; profile: ApiProfile | null; onProfileChange: (profile: ApiProfile) => void; onNotice: (message: string) => void }) {
  const [draft, setDraft] = useState<UpdateProfileInput>({ displayName: profile?.displayName ?? "", school: profile?.school ?? "", city: profile?.city ?? "", role: profile?.role ?? "renter", bio: profile?.bio ?? "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const saved = await updateMyProfile(token, buildProfileUpdateInput(draft));
      assertCurrentAuthSession(token);
      onProfileChange(saved);
      onNotice("个人资料已保存。");
    } catch {
      setError("个人资料保存失败，请重试。");
    } finally {
      setSaving(false);
    }
  }
  return <section className="rounded-psw-2xl border border-line-strong bg-surface p-6 sm:p-8"><h2 className="font-rounded text-m-title sm:text-d-title font-bold">个人资料</h2><p className="mt-2 text-sm text-ink-secondary">更新账户名称、所在地和个人简介。租房申请的联系人信息请在提交时核对。</p><form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={save}><Field label="显示名称" value={draft.displayName ?? ""} onChange={(value) => { setDraft({ ...draft, displayName: value }); setError(null); }} /><Field label="学校或公司" value={draft.school ?? ""} onChange={(value) => { setDraft({ ...draft, school: value }); setError(null); }} /><Field label="城市" value={draft.city ?? ""} onChange={(value) => { setDraft({ ...draft, city: value }); setError(null); }} /><label className="grid gap-2 text-sm font-bold">身份<select className="application-input" value={draft.role} onChange={(event) => { setDraft({ ...draft, role: event.target.value as UpdateProfileInput["role"] }); setError(null); }}><option value="renter">租客</option><option value="lister">转租人</option><option value="both">租客兼转租人</option></select></label><label className="grid gap-2 text-sm font-bold sm:col-span-2">个人简介<textarea className="min-h-28 rounded-psw-lg border border-line-strong p-4 text-sm outline-none focus:border-primary" value={draft.bio ?? ""} onChange={(event) => { setDraft({ ...draft, bio: event.target.value }); setError(null); }} /></label>{error ? <p role="alert" className="rounded-psw-lg bg-danger-soft px-4 py-3 text-sm font-bold text-danger-text sm:col-span-2">{error}</p> : null}<button disabled={saving} className="w-fit rounded-full bg-primary px-6 py-3 text-sm font-bold text-white">{saving ? "保存中…" : "保存资料"}</button></form></section>;
}

function VerificationPanel({ profile }: { profile: ApiProfile | null }) {
  return <section className="rounded-psw-2xl border border-line-strong bg-surface p-6 sm:p-8">
    <h2 className="font-rounded text-m-title sm:text-d-title font-bold">身份与认证</h2>
    <p className="mt-2 text-sm leading-6 text-ink-secondary">查看登录邮箱及其他认证的当前状态。</p>
    <div className="mt-7 divide-y divide-line">
      <VerificationRow icon={Mail} title="邮箱认证" detail="账户登录邮箱已验证" done />
      <VerificationRow icon={IdCard} title="教育邮箱" detail={profile?.eduEmailVerified ? "教育邮箱已验证" : "教育邮箱认证暂未开放。"} done={Boolean(profile?.eduEmailVerified)} />
      <VerificationRow icon={ShieldCheck} title="手机认证" detail={profile?.phoneVerified ? "手机号已验证" : "手机号认证暂未开放。"} done={Boolean(profile?.phoneVerified)} />
    </div>
  </section>;
}
function SettingsPanel() {
  return <section className="rounded-psw-2xl border border-line-strong bg-surface p-6 sm:p-8">
    <h2 className="font-rounded text-m-title sm:text-d-title font-bold">通知与隐私</h2>
    <p className="mt-2 text-sm leading-6 text-ink-secondary">目前通过站内页面查看更新，暂不支持单独设置通知开关。</p>
    <div className="mt-7 divide-y divide-line">
      <SettingsRow icon={Bell} title="申请进度" detail="查看申请状态与处理进度" href="/applications" />
      <SettingsRow icon={Mail} title="新消息" detail="查看预约、房源和室友对话" href="/inbox" />
      <SettingsRow icon={LockKeyhole} title="个性化推荐" detail="暂不支持根据浏览与收藏记录定制推荐。" />
    </div>
  </section>;
}
function Benefit({ icon: Icon, title, detail }: { icon: typeof Heart; title: string; detail: string }) { return <div className="flex gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface text-primary-text"><Icon className="size-[18px]" aria-hidden="true" /></span><span><span className="block text-d-label text-ink">{title}</span><span className="mt-0.5 block text-m-footnote text-ink-secondary">{detail}</span></span></div>; }
function QuickLink({ href, title, detail }: { href: string; title: string; detail: string }) { return <Link href={href} className="flex items-center gap-3 rounded-psw-xl bg-surface p-5 transition-[box-shadow,transform] hover:-translate-y-1 hover:shadow-card-hover"><span className="min-w-0 flex-1"><span className="block font-rounded text-d-label text-ink">{title}</span><span className="mt-1 block text-m-footnote text-ink-secondary">{detail}</span></span><ChevronRight className="size-4 shrink-0 text-primary-text" aria-hidden="true" /></Link>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="grid gap-2 text-sm font-bold">{label}<input className="application-input" value={value} onChange={(event) => onChange(event.target.value)} /></label>; }
function VerificationRow({ icon: Icon, title, detail, done }: { icon: typeof Mail; title: string; detail: string; done: boolean }) {
  return <div className="flex items-center gap-3 py-5 sm:gap-4">
    <span className="grid size-11 shrink-0 place-items-center rounded-psw-md bg-tag-neutral"><Icon className="size-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-m-footnote leading-5 text-ink-secondary">{detail}</span></span>
    <span className={cn("shrink-0 rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", done ? "bg-surface-subtle text-primary-text" : "bg-tag-neutral text-ink-secondary")}>{done ? "已完成" : "暂未开放"}</span>
  </div>;
}
function SettingsRow({ icon: Icon, title, detail, href }: { icon: typeof Bell; title: string; detail: string; href?: string }) {
  return <div className="flex items-center gap-3 py-5 sm:gap-4">
    <span className="grid size-11 shrink-0 place-items-center rounded-psw-md bg-tag-neutral"><Icon className="size-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{title}</span><span className="mt-1 block text-m-footnote leading-5 text-ink-secondary">{detail}</span></span>
    {href ? <Link href={href} aria-label={`查看${title}`} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-m-footnote font-bold text-primary-text hover:bg-surface-subtle">查看<ChevronRight className="size-4" aria-hidden="true" /></Link> : <span className="shrink-0 rounded-full bg-tag-neutral px-3 py-1.5 text-m-footnote font-bold text-ink-secondary">暂未开放</span>}
  </div>;
}
