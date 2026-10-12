"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { MfaProofFields } from "@/components/mfa-settings";
import { getActiveAdminStepUpToken, type AdminStepUpSession } from "@/lib/admin-step-up";
import { assertCurrentAuthSession, readStoredAuthSession, writeStoredAuthSession } from "@/lib/auth-session";
import { getMfaStatus, verifyMfa, type MfaStatus } from "@/lib/mfa";
import { toProductApiError } from "@/lib/product-errors";

export function AdminStepUpPanel({ open, sessionToken, email, onVerified, onCancel, onAuthenticationError, assertSessionCurrent }: {
  open: boolean; sessionToken: string; email: string; onVerified: (session: AdminStepUpSession) => void; onCancel: () => void;
  onAuthenticationError?: (error: unknown) => boolean; assertSessionCurrent?: () => void;
}) {
  const panelId = useId();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const current = () => mounted.current && readStoredAuthSession()?.accessToken === sessionToken;

  useEffect(() => {
    mounted.current = open;
    setStatus(null); setCode(""); setRecovery(false); setPending(false); setError(null);
    if (!open) return;
    let cancelled = false;
    getMfaStatus(sessionToken).then(result => {
      if (!cancelled && readStoredAuthSession()?.accessToken === sessionToken) setStatus(result);
    }).catch(caught => {
      if (cancelled || readStoredAuthSession()?.accessToken !== sessionToken) return;
      const productError = toProductApiError(caught);
      if (productError.status === 401 && onAuthenticationError?.(productError)) return;
      setError(productError.message);
    });
    return () => { cancelled = true; mounted.current = false; };
  // Authentication callback identity must not reset an in-progress form.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionToken, attempt]);

  if (!open) return null;
  async function submit(event: FormEvent) {
    event.preventDefault();
    const value = code.trim();
    if (busy.current || !current() || (recovery ? !value : !/^\d{6}$/.test(value))) return;
    busy.current = true; setPending(true); setError(null);
    try {
      assertCurrentAuthSession(sessionToken); assertSessionCurrent?.();
      const result = await verifyMfa(sessionToken, recovery ? { recoveryCode: value } : { code: value });
      if (!current()) return;
      assertSessionCurrent?.();
      const enhanced = { accessToken: result.accessToken, reauthenticatedUntil: result.verifiedUntil };
      if (!getActiveAdminStepUpToken(enhanced)) throw new Error("Invalid verification response");
      // Bind proof to the administrator before token rotation remounts the caller.
      onVerified(enhanced);
      if (readStoredAuthSession()?.accessToken === sessionToken) writeStoredAuthSession(result.accessToken);
      setCode("");
    } catch (caught) {
      if (!current()) return;
      const productError = toProductApiError(caught);
      if (productError.status === 401 && onAuthenticationError?.(productError)) return;
      setError(productError.message);
    } finally { busy.current = false; if (current()) setPending(false); }
  }

  return <section aria-labelledby={`${panelId}-title`} className="app-shell py-4">
    <div className="editorial-panel mx-auto max-w-xl p-4 md:p-6">
      <div className="editorial-kicker">管理员安全验证</div>
      <h2 id={`${panelId}-title`} className="mt-2 text-xl font-black text-primary">管理员双重验证</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{email} · 使用独立验证器或恢复码。验证后 10 分钟内可执行敏感操作。</p>
      {!status && !error ? <p role="status" className="mt-4 text-sm text-slate-600">正在读取双重验证状态…</p> : null}
      {status?.enabled ? <form className="mt-5 grid gap-3" onSubmit={submit}>
        <MfaProofFields recovery={recovery} value={code} pending={pending} onChange={setCode} onToggle={() => { setRecovery(!recovery); setCode(""); setError(null); }} />
        <Button type="submit" variant="trust" disabled={pending || (recovery ? !code.trim() : !/^\d{6}$/.test(code))}>{pending ? "验证中…" : "完成管理员验证"}</Button>
      </form> : status ? <div className="mt-5"><p className="text-sm text-slate-700">此账户尚未启用双重验证，请先绑定验证器并保存恢复码。</p><Link href="/account/verification" className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-blue-700 underline underline-offset-4">前往绑定验证器</Link></div> : null}
      {error ? <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {error && !status ? <Button type="button" className="mt-3" variant="outline" onClick={() => setAttempt(attempt + 1)}>重试读取状态</Button> : null}
      <Button type="button" className="mt-3" variant="ghost" disabled={pending} onClick={onCancel}>取消</Button>
    </div>
  </section>;
}
