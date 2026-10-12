"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { assertCurrentAuthSession, readStoredAuthSession, writeStoredAuthSession } from "@/lib/auth-session";
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa, getMfaStatus, verifyMfa, type MfaEnrollment, type MfaEnrollmentConfirmation, type MfaProof, type MfaStatus } from "@/lib/mfa";
import { toProductApiError, type ProductApiError } from "@/lib/product-errors";

const actionClass = "min-h-11 rounded-full bg-[#2453ff] px-5 py-3 text-sm font-bold text-white disabled:opacity-60";
const secondaryClass = "min-h-11 rounded-full border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 disabled:opacity-60";

export function MfaProofFields({ recovery, value, pending, onChange, onToggle, allowRecovery = true }: {
  recovery: boolean; value: string; pending: boolean; onChange: (value: string) => void; onToggle: () => void; allowRecovery?: boolean;
}) {
  const id = useId();
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-bold">{recovery ? "恢复码" : "验证器验证码"}</label>
    <input id={id} name="mfa-proof" type="password" inputMode={recovery ? "text" : "numeric"} autoComplete={recovery ? "off" : "one-time-code"} maxLength={recovery ? 128 : 6}
      value={value} disabled={pending} onChange={event => onChange(recovery ? event.target.value : event.target.value.replace(/\D/g, ""))}
      aria-describedby={`${id}-help`} className="application-input w-full" />
    <p id={`${id}-help`} className="text-sm leading-6 text-slate-600">{recovery ? "输入一个尚未使用的恢复码。成功验证后，该码不能再次使用。" : "输入验证器应用中当前显示的六位验证码。"}</p>
    {allowRecovery ? <button type="button" disabled={pending} onClick={onToggle} className="min-h-11 text-sm font-bold text-blue-700 underline underline-offset-4">{recovery ? "使用验证器验证码" : "使用恢复码"}</button> : null}
  </div>;
}

export function RecoveryCodes({ codes, onDismiss }: { codes: string[]; onDismiss: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section aria-labelledby="mfa-recovery-title" className="mt-6 rounded-[24px] border border-blue-200 bg-white p-6">
    <h2 id="mfa-recovery-title" ref={heading} tabIndex={-1} className="text-xl font-black">保存恢复码</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">恢复码只在这里显示一次。请保存在安全的位置；失去验证器时，每个恢复码可用一次。离开页面或退出登录后无法再次查看。</p>
    <ul aria-label="一次性恢复码" className="my-4 grid gap-2 font-mono text-sm sm:grid-cols-2">{codes.map(code => <li key={code} className="break-all rounded-lg bg-slate-100 px-3 py-2">{code}</li>)}</ul>
    <button type="button" className={secondaryClass} onClick={async () => {
      try { await navigator.clipboard.writeText(codes.join("\n")); setCopied(true); setCopyError(false); }
      catch { setCopyError(true); }
    }}>复制恢复码</button>
    {copied ? <p role="status" className="mt-2 text-sm text-slate-700">恢复码已复制，请妥善保存并清除共享设备上的剪贴板。</p> : null}
    {copyError ? <p role="alert" className="mt-2 text-sm text-red-700">复制失败，请手动保存上面的恢复码。</p> : null}
    <label className="my-4 flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />我已将恢复码保存在安全的位置</label>
    <button type="button" disabled={!saved} onClick={onDismiss} className={actionClass}>完成并隐藏恢复码</button>
  </section>;
}

export function MfaSettings({ token, onEnrolled, onReauthenticate }: {
  token: string; onEnrolled: (result: MfaEnrollmentConfirmation) => void; onReauthenticate: () => void | Promise<void>;
}) {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [mode, setMode] = useState<"idle" | "enroll" | "verify" | "disable">("idle");
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ProductApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const secretId = useId();
  const current = () => mounted.current && readStoredAuthSession()?.accessToken === token;
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    setError(null);
    getMfaStatus(token).then(result => { if (!cancelled && readStoredAuthSession()?.accessToken === token) setStatus(result); })
      .catch(caught => { if (!cancelled && readStoredAuthSession()?.accessToken === token) setError(toProductApiError(caught)); });
    return () => { cancelled = true; mounted.current = false; };
  }, [token, attempt]);

  function reset() { setMode("idle"); setEnrollment(null); setValue(""); setRecovery(false); setShowSecret(false); setError(null); }
  function start(nextMode: "verify" | "disable") { reset(); setNotice(null); setMode(nextMode); }
  async function run(operation: () => Promise<void>) {
    if (busy.current || !current()) return;
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try { assertCurrentAuthSession(token); await operation(); }
    catch (caught) { if (current()) setError(toProductApiError(caught)); }
    finally { busy.current = false; if (current()) setPending(false); }
  }
  async function enroll() {
    await run(async () => {
      const result = await beginMfaEnrollment(token);
      if (!current()) return;
      setEnrollment(result); setMode("enroll"); setValue(""); setRecovery(false);
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (recovery ? !trimmed : !/^\d{6}$/.test(trimmed)) return;
    await run(async () => {
      if (mode === "enroll") {
        const result = await confirmMfaEnrollment(token, trimmed);
        if (!current()) return;
        reset(); onEnrolled(result);
      } else {
        const proof: MfaProof = recovery ? { recoveryCode: trimmed } : { code: trimmed };
        if (mode === "disable") {
          await disableMfa(token, proof);
          if (!current()) return;
          reset(); setStatus({ enabled: false, recoveryCodesRemaining: 0, verifiedUntil: null }); setNotice("双重验证已停用。敏感操作前需要重新启用。");
        } else {
          const result = await verifyMfa(token, proof);
          if (!current()) return;
          reset(); writeStoredAuthSession(result.accessToken);
        }
      }
    });
  }

  return <section aria-labelledby={`${secretId}-title`} className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <h2 id={`${secretId}-title`} className="text-2xl font-black">双重验证</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">使用验证器应用保护敏感操作。普通邮箱登录保持不变；管理员审核和资金操作需要启用双重验证，并在操作前完成近期验证。</p>
    {!status && !error ? <p role="status" className="mt-4 text-sm text-slate-600">正在读取双重验证状态…</p> : null}
    {status ? <p className="mt-4 text-sm font-bold">{status.enabled ? `已启用 · 剩余 ${status.recoveryCodesRemaining} 个恢复码` : "尚未启用"}</p> : null}
    {status?.verifiedUntil && Date.parse(status.verifiedUntil) > Date.now() ? <p className="mt-2 text-sm text-slate-600">已完成近期验证，有效至 {new Date(status.verifiedUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}。</p> : null}
    {status && mode === "idle" ? <div className="mt-5 flex flex-wrap gap-3">{status.enabled ? <><button className={actionClass} disabled={pending} onClick={() => start("verify")}>验证敏感操作</button><button className={secondaryClass} disabled={pending} onClick={() => start("disable")}>停用双重验证</button></> : <button className={actionClass} disabled={pending} onClick={() => void enroll()}>{pending ? "准备中…" : "绑定验证器"}</button>}</div> : null}
    {mode === "enroll" && enrollment ? <div className="mt-5 space-y-3">
      <p className="text-sm leading-6 text-slate-600">1. 在验证器应用中添加账户。2. 输入该应用生成的验证码。3. 保存一次性恢复码。</p>
      <p className="text-sm leading-6 text-slate-600">更改双重验证会退出其他设备，当前设备保持登录。</p>
      <a href={enrollment.otpauthUri.startsWith("otpauth://") ? enrollment.otpauthUri : undefined} className="inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline underline-offset-4">在验证器应用中打开</a>
      <label htmlFor={secretId} className="block text-sm font-bold">验证器设置密钥</label>
      <input id={secretId} type={showSecret ? "text" : "password"} readOnly value={enrollment.secret} autoComplete="off" className="application-input w-full font-mono" />
      <button type="button" className={secondaryClass} onClick={() => setShowSecret(!showSecret)}>{showSecret ? "隐藏密钥" : "显示密钥"}</button>
      <p className="text-sm text-slate-600">无法打开应用时，可显示并手动复制密钥。请勿分享密钥、验证码或恢复码。</p>
    </div> : null}
    {mode !== "idle" ? <form onSubmit={submit} className="mt-5 space-y-4">
      {mode === "disable" ? <p className="rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900">停用后现有恢复码将失效。管理员与资金敏感操作将暂停，直到你重新绑定验证器。更改双重验证会退出其他设备，当前设备保持登录。请输入独立验证码或恢复码确认。</p> : null}
      <MfaProofFields recovery={recovery} value={value} pending={pending} onChange={setValue} onToggle={() => { setRecovery(!recovery); setValue(""); setError(null); }} allowRecovery={mode !== "enroll"} />
      <div className="flex flex-wrap gap-3"><button className={actionClass} disabled={pending || (recovery ? !value.trim() : !/^\d{6}$/.test(value))}>{pending ? "处理中…" : mode === "enroll" ? "确认启用" : mode === "disable" ? "确认停用" : "确认验证"}</button><button type="button" disabled={pending} onClick={reset} className={secondaryClass}>取消</button></div>
    </form> : null}
    {error ? <div className="mt-4"><p role="alert" className="text-sm font-bold text-red-700">{error.message}</p>{error.status === 401 || error.code === "AUTH_RECENT_LOGIN_REQUIRED" ? <button className={`${secondaryClass} mt-3`} disabled={pending} onClick={() => void onReauthenticate()}>重新登录邮箱</button> : !status ? <button className={`${secondaryClass} mt-3`} onClick={() => setAttempt(attempt + 1)}>重试读取状态</button> : null}</div> : null}
    {notice ? <p role="status" className="mt-4 text-sm text-slate-700">{notice}</p> : null}
  </section>;
}
