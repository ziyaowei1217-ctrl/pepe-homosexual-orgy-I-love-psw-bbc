"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { useConfirm } from "@/components/marketplace/confirm-dialog";
import { phoneErrorMessage, phoneRegionText, RESEND_COOLDOWN_MS } from "@/components/marketplace/sign-in-options";
import { getResendSeconds, normalizeVerificationCode } from "@/lib/auth-flow";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { toProductApiError } from "@/lib/product-errors";
import { getPhoneStatus, looksLikePhoneNumber, normalizePhoneInput, requestPhoneLinkCode, unlinkPhone, verifyPhoneLinkCode, type PhoneStatus } from "@/lib/phone-auth";

// Account → 身份与认证: link a verified mobile number, which then works for
// SMS sign-in. Only the masked number is ever shown back. `fallback` is the
// read-only row shown when the API has no phone support (an older API).
// `phoneOnly` marks an account created by phone sign-up: its number is its only
// sign-in, so the row offers to change the number instead of removing it (the
// API refuses the removal too). `admin` marks an administrator: the number is
// for step-up verification only, and once linked only an operator changes it.
// The API's phone status says whether the account is an administrator now, which
// replaces `admin` (the role read when the page loaded) once it arrives;
// `onAdminChange` passes that on.
export function PhoneVerificationRow({ token, onChanged, fallback, phoneOnly = false, admin = false, onAdminChange }: { token: string; onChanged: (linked: boolean) => void; fallback: ReactNode; phoneOnly?: boolean; admin?: boolean; onAdminChange?: (admin: boolean) => void }) {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const resendSeconds = getResendSeconds(resendAt, now);
  const codeInput = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"idle" | "phone" | "code">("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, confirm] = useConfirm();
  const busy = useRef(false);
  const id = useId();

  useEffect(() => {
    let active = true;
    getPhoneStatus(token)
      .then((value) => { if (active) setStatus(value); })
      .catch((caught) => { if (active) setLoadError(toProductApiError(caught).status === 404 ? "missing" : "failed"); });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [resendSeconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (step === "code") codeInput.current?.focus(); }, [step]);

  const isAdmin = status?.admin ?? admin;
  const serverAdmin = status?.admin;
  useEffect(() => { if (serverAdmin !== undefined) onAdminChange?.(serverAdmin); }, [serverAdmin, onAdminChange]);

  async function run(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try { assertCurrentAuthSession(token); await action(); }
    catch (caught) {
      setError(phoneErrorMessage(caught, "操作未完成，请稍后重试。"));
      // The account became an administrator after this page loaded: reload the status so the row shows the number as
      // the operator-only one it now is, without the buttons the API refuses.
      if (toProductApiError(caught).code === "ADMIN_PHONE_LOCKED") {
        setStep("idle");
        void getPhoneStatus(token).then((value) => { assertCurrentAuthSession(token); setStatus(value); }).catch(() => undefined);
      }
    }
    finally { busy.current = false; setPending(false); }
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!looksLikePhoneNumber(phone)) { setError("请输入完整的手机号。"); return; }
    if (step === "code" && resendSeconds > 0) return;
    void run(async () => {
      const response = await requestPhoneLinkCode(token, phone.trim());
      assertCurrentAuthSession(token);
      setCode(response.devCode ? normalizeVerificationCode(response.devCode) : "");
      setNotice(`验证码短信已发往 ${response.phoneNumber}，10 分钟内有效。如果该号码已绑定其他账户，则不会收到短信。`);
      const sentAt = Date.now(); setNow(sentAt); setResendAt(sentAt + RESEND_COOLDOWN_MS);
      setStep("code");
    });
  };

  const verify = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeVerificationCode(code);
    if (normalized.length !== 6) { setError("请输入六位验证码。"); return; }
    const replacing = Boolean(status?.linked);
    void run(async () => {
      const response = await verifyPhoneLinkCode(token, phone.trim(), normalized);
      assertCurrentAuthSession(token);
      const linkedAsAdmin = response.admin ?? isAdmin;
      setStatus((current) => current ? { ...current, linked: true, phoneNumber: response.phoneNumber, verifiedAt: response.verifiedAt, ...(response.admin === undefined ? {} : { admin: response.admin }) } : current);
      setStep("idle"); setPhone(""); setCode("");
      // The masked numbers cannot tell a new number from the same one entered again, so the notice names the result.
      setNotice(linkedAsAdmin ? "手机号已绑定，24 小时后可用于管理员二次验证。" : replacing ? `已绑定 ${response.phoneNumber}，之后用这个号码登录。` : "手机号已绑定，之后可以用短信验证码登录。");
      onChanged(true);
    });
  };

  async function remove() {
    const answer = await confirm({ title: "解除绑定手机号？", body: "解除后不能再用这个号码登录，手机认证标记也会取消。", confirmLabel: "解除绑定", tone: "danger" });
    if (answer === false) return;
    void run(async () => {
      await unlinkPhone(token);
      assertCurrentAuthSession(token);
      setStatus((current) => current ? { ...current, linked: false, phoneNumber: null, verifiedAt: null } : current);
      setNotice("已解除绑定。");
      onChanged(false);
    });
  }

  if (loadError === "missing") return <>{fallback}</>;
  // A linked number stays visible while SMS is switched off, and ordinary accounts can still remove it then. An account
  // created by phone can only change its number, which needs SMS; an administrator's number is changed by an operator.
  const detail = loadError ? "手机号状态暂时无法读取，请刷新页面重试。"
    : !status ? "正在读取手机号状态…"
    : status.linked && isAdmin ? `已绑定 ${status.phoneNumber}，${adminStepUpFrom(status.verifiedAt, now)}用于管理员二次验证${status.enabled ? "" : "（短信暂时关闭）"}。只能由运营人员更改或解除。`
    : status.linked && phoneOnly ? `已绑定 ${status.phoneNumber}。这个账户用手机号登录，${status.enabled ? "可以更换号码，不能解除绑定。" : "短信登录暂时关闭。"}`
    : status.linked ? (status.enabled ? `已绑定 ${status.phoneNumber}，可用于短信验证码登录。` : `已绑定 ${status.phoneNumber}。短信登录暂时关闭。`)
    : !status.enabled ? "短信验证暂未开放。"
    : isAdmin ? `绑定后用于管理员二次验证，24 小时后可用，之后只能由运营人员更改或解除。${phoneRegionText(status.regions)}`
    : `绑定后可用短信验证码登录。${phoneRegionText(status.regions)}`;

  return <div className="py-5">
    {dialog}
    <div className="flex items-center gap-3 sm:gap-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-psw-md bg-tag-neutral"><Smartphone className="size-5" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold">手机认证</span><span className="mt-1 block text-m-footnote leading-5 text-ink-secondary">{detail}</span></span>
      {!status ? null : (status.enabled || status.linked) && step === "idle" ? (status.linked && isAdmin ? null : status.linked && phoneOnly
        ? (status.enabled ? <button type="button" disabled={pending} onClick={() => { setStep("phone"); setNotice(null); }} className="secondary-action shrink-0">更换号码</button> : null)
        : status.linked
        ? <button type="button" disabled={pending} onClick={() => void remove()} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-m-footnote font-bold text-danger-text hover:bg-surface-subtle">解除绑定</button>
        : <button type="button" disabled={pending} onClick={() => { setStep("phone"); setNotice(null); }} className="secondary-action shrink-0">绑定手机号</button>)
        : status.linked ? null : <span className="shrink-0 rounded-psw-sm bg-tag-neutral px-2.5 py-1 text-m-footnote font-bold text-ink-secondary">{status.enabled ? "未绑定" : "暂未开放"}</span>}
    </div>
    {step === "phone" ? <form className="mt-4 grid max-w-md gap-2 sm:ml-[60px]" onSubmit={send} noValidate>
      <label className="text-sm font-bold" htmlFor={`${id}-phone`}>{status?.linked ? "新手机号" : "手机号"}</label>
      <input id={`${id}-phone`} type="tel" autoComplete="tel" inputMode="tel" value={phone} maxLength={24} onChange={(event) => { setPhone(normalizePhoneInput(event.target.value)); setError(null); }} placeholder="+1 415 555 0123" className="application-input" />
      <div className="flex flex-wrap gap-2"><button disabled={pending} className="primary-action disabled:opacity-60">{pending ? "发送中…" : "发送短信验证码"}</button><button type="button" disabled={pending} onClick={() => { setStep("idle"); setError(null); }} className="min-h-11 px-3 text-sm font-bold text-ink-secondary">取消</button></div>
    </form> : null}
    {step === "code" ? <form className="mt-4 grid max-w-md gap-2 sm:ml-[60px]" onSubmit={verify} noValidate>
      <label className="text-sm font-bold" htmlFor={`${id}-code`}>短信验证码</label>
      <input ref={codeInput} id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => { setCode(normalizeVerificationCode(event.target.value)); setError(null); }} placeholder="六位验证码" className="application-input" />
      <div className="flex flex-wrap gap-2"><button disabled={pending} className="primary-action disabled:opacity-60">{pending ? "验证中…" : "验证并绑定"}</button><button type="button" disabled={pending || resendSeconds > 0} onClick={() => send()} className="min-h-11 px-3 text-sm font-bold text-primary-text disabled:text-ink-secondary">{resendSeconds > 0 ? `重新发送（${resendSeconds} 秒）` : "重新发送"}</button><button type="button" disabled={pending} onClick={() => { setStep("phone"); setError(null); }} className="min-h-11 px-3 text-sm font-bold text-ink-secondary">修改号码</button></div>
    </form> : null}
    {notice ? <p role="status" className="mt-3 text-m-footnote font-bold text-success-text sm:ml-[60px]">{notice}</p> : null}
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-danger-text sm:ml-[60px]">{error}</p> : null}
  </div>;
}

/** The API trusts a newly linked administrator number for step-up a day after it was linked (ADMIN_STEP_UP_PHONE_MIN_AGE_MS). */
const ADMIN_STEP_UP_PHONE_WAIT_MS = 24 * 60 * 60 * 1000;
let stepUpTimeFormat: Intl.DateTimeFormat | undefined;

/** "11月18日 08:05 起" while a newly linked administrator number is not yet trusted for step-up, otherwise nothing. */
function adminStepUpFrom(verifiedAt: string | null, now: number) {
  const usableAt = verifiedAt ? Date.parse(verifiedAt) + ADMIN_STEP_UP_PHONE_WAIT_MS : Number.NaN;
  if (!(usableAt > now)) return "";
  stepUpTimeFormat ??= new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${stepUpTimeFormat.format(usableAt)} 起`;
}
