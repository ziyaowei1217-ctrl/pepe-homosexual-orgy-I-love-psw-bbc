"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { GoogleSignIn } from "@/components/marketplace/google-sign-in";
import { getResendSeconds, normalizeVerificationCode } from "@/lib/auth-flow";
import { enabledAuthMethods } from "@/lib/auth-methods";
import { readStoredAuthSession } from "@/lib/auth-session";
import { acceptEmailSignInCode, EmailCodeError, exchangeProviderSession, sendEmailSignInCode, signInFailureMessage, startSocialSignIn, type SignInAttempt, type SocialProvider } from "@/lib/neon-auth-client";
import { apiGet } from "@/lib/api";
import { looksLikePhoneNumber, normalizePhoneInput, requestPhoneSignInCode, verifyPhoneSignInCode } from "@/lib/phone-auth";
import { toProductApiError } from "@/lib/product-errors";
import { cn } from "@/lib/utils";

type Props = { returnTo: string | null; disabled?: boolean; onAuthenticated: (accessToken: string) => void };
type CodeMethod = "email" | "phone";
type PhoneAvailability = { state: "loading" } | { state: "on"; regions: string[] } | { state: "off" } | { state: "offline" };

const socialLabels: Record<SocialProvider, string> = { google: "使用 Google 登录", github: "使用 GitHub 登录" };
const codeLabels: Record<CodeMethod, string> = { email: "邮箱验证码", phone: "手机号" };
export const RESEND_COOLDOWN_MS = 60_000;

// Neon-mode sign-in. With only Google configured this is the original screen.
export function SignInOptions({ returnTo, disabled = false, onAuthenticated }: Props) {
  const methods = enabledAuthMethods();
  const social = methods.filter((method): method is SocialProvider => method === "google" || method === "github");
  const configuredCodeMethods = methods.filter((method): method is CodeMethod => method === "email" || method === "phone");
  const phoneConfigured = configuredCodeMethods.includes("phone");
  const [phone, setPhone] = useState<PhoneAvailability>({ state: phoneConfigured ? "loading" : "off" });
  const [selected, setSelected] = useState<CodeMethod | undefined>(configuredCodeMethods[0]);
  const tabsId = useId();
  const tabRefs = useRef<Partial<Record<CodeMethod, HTMLButtonElement | null>>>({});

  const loadPhone = useCallback(() => {
    let active = true;
    setPhone({ state: "loading" });
    apiGet<{ enabled: boolean; regions: string[] }>("/auth/phone/availability")
      .then((value) => { if (active) setPhone(value.enabled === true ? { state: "on", regions: Array.isArray(value.regions) ? value.regions : [] } : { state: "off" }); })
      // A missing route (an older API) counts as off; only a network failure offers a retry.
      .catch((caught) => { if (active) setPhone(toProductApiError(caught).category === "network" ? { state: "offline" } : { state: "off" }); });
    return () => { active = false; };
  }, []);
  useEffect(() => phoneConfigured ? loadPhone() : undefined, [phoneConfigured, loadPhone]);

  if (methods.length === 1 && methods[0] === "google") return <GoogleSignIn returnTo={returnTo} disabled={disabled} />;

  // The phone tab is hidden when the API says phone sign-in is off.
  const codeMethods = configuredCodeMethods.filter((method) => method !== "phone" || phone.state !== "off");
  const active = selected && codeMethods.includes(selected) ? selected : codeMethods[0];
  const tabbed = codeMethods.length > 1;
  const accountCreators = methods.filter((method) => method !== "phone").map((method) => method === "email" ? "邮箱验证码" : method === "github" ? "GitHub" : "Google");

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const next = event.key === "Home" ? 0 : event.key === "End" ? codeMethods.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + codeMethods.length) % codeMethods.length;
    setSelected(codeMethods[next]);
    tabRefs.current[codeMethods[next]]?.focus();
  }

  return <div className="mt-6 max-w-md">
    {social.length ? <div className="grid gap-3">{social.map((provider, index) => <SocialButton key={provider} provider={provider} primary={index === 0} returnTo={returnTo} disabled={disabled} />)}</div> : null}
    {social.length && codeMethods.length ? <div className="my-6 flex items-center gap-3 text-m-footnote font-bold text-ink-secondary" aria-hidden="true"><span className="h-px flex-1 bg-line-strong" />或使用验证码<span className="h-px flex-1 bg-line-strong" /></div> : null}
    {tabbed ? <div role="tablist" aria-label="验证码登录方式" className="mb-4 grid grid-cols-2 rounded-full bg-surface-subtle p-1">
      {codeMethods.map((method, index) => <button key={method} ref={(node) => { tabRefs.current[method] = node; }} type="button" role="tab" id={`${tabsId}-${method}`} aria-selected={active === method} aria-controls={`${tabsId}-${method}-panel`} tabIndex={active === method ? 0 : -1}
        onClick={() => setSelected(method)} onKeyDown={(event) => onTabKey(event, index)} className={cn("min-h-11 rounded-full text-sm font-bold text-ink-secondary", active === method && "bg-surface text-primary-text shadow-card")}>{codeLabels[method]}</button>)}
    </div> : null}
    {/* Both panels stay mounted, so switching tabs keeps typed values and in-flight sign-ins. */}
    {codeMethods.map((method) => <div key={method} id={`${tabsId}-${method}-panel`} role={tabbed ? "tabpanel" : undefined} aria-labelledby={tabbed ? `${tabsId}-${method}` : undefined} hidden={active !== method}>
      {method === "email" ? <EmailCodeSignIn returnTo={returnTo} disabled={disabled} onAuthenticated={onAuthenticated} />
        : <PhoneCodeSignIn availability={phone} onRetry={loadPhone} disabled={disabled} onAuthenticated={onAuthenticated} accountCreators={accountCreators} />}
    </div>)}
    <p className="mt-5 text-m-footnote leading-5 text-ink-secondary">账户与消息由服务器保存，可在不同设备上使用。无需设置密码。</p>
  </div>;
}

function SocialButton({ provider, primary, returnTo, disabled }: { provider: SocialProvider; primary: boolean; returnTo: string | null; disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  async function signIn() {
    if (busy.current || disabled) return;
    busy.current = true; setPending(true); setError(null);
    try { await startSocialSignIn(provider, returnTo); }
    catch { setError("暂时无法登录。请检查网络并允许本站存储登录状态后重试。"); }
    finally { busy.current = false; setPending(false); }
  }
  return <div>
    <button type="button" disabled={pending || disabled} onClick={signIn} className={cn(primary ? "primary-action" : "secondary-action", "w-full disabled:opacity-60")}>{pending ? "正在连接…" : socialLabels[provider]}</button>
    {error ? <p role="alert" className="mt-2 text-sm font-bold text-danger-text">{error}</p> : null}
  </div>;
}

function useMounted() {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return mounted;
}

// Resend is offered once a minute, with a visible countdown.
function useResendCooldown() {
  const [availableAt, setAvailableAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const seconds = getResendSeconds(availableAt, now);
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [seconds > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return { seconds, start: () => { const at = Date.now(); setNow(at); setAvailableAt(at + RESEND_COOLDOWN_MS); } };
}

function useFocusOnStep(step: string, target: string) {
  const ref = useRef<HTMLInputElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (step === target) ref.current?.focus();
  }, [step, target]);
  return ref;
}

function EmailCodeSignIn({ returnTo, disabled, onAuthenticated }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  // Set once Neon accepted the code: a retry after a failed exchange must not
  // send the (now used) code again.
  const accepted = useRef<SignInAttempt | null>(null);
  const mounted = useMounted();
  const cooldown = useResendCooldown();
  const codeInput = useFocusOnStep(step, "code");
  const id = useId();

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current || disabled) return;
    const resend = step === "code";
    if (resend && cooldown.seconds > 0) return;
    const normalized = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) { setError("请输入有效的邮箱地址。"); return; }
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try {
      await sendEmailSignInCode(normalized);
      if (!mounted.current) return;
      accepted.current = null;
      setEmail(normalized); setCode(""); setStep("code"); cooldown.start();
      if (resend) setNotice("已重新发送验证码。");
    } catch (caught) { if (mounted.current) setError(caught instanceof EmailCodeError ? caught.message : "暂时无法发送验证码，请稍后再试。"); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy.current || disabled) return;
    const normalized = normalizeVerificationCode(code);
    if (!accepted.current && normalized.length !== 6) { setError("请输入六位验证码。"); return; }
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try {
      accepted.current ??= await acceptEmailSignInCode(email, normalized, returnTo);
      const response = await exchangeProviderSession(accepted.current);
      accepted.current = null;
      if (mounted.current) onAuthenticated(response.accessToken);
    } catch (caught) {
      if (!mounted.current) return;
      setError(caught instanceof EmailCodeError ? caught.message : signInFailureMessage(caught));
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  function changeEmail() {
    if (busy.current) return;
    accepted.current = null; setStep("email"); setError(null); setNotice(null);
  }

  if (step === "email") return <form onSubmit={send} noValidate>
    <label className="text-sm font-bold" htmlFor={`${id}-email`}>邮箱地址</label>
    <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" value={email} maxLength={254} onChange={(event) => { setEmail(event.target.value); setError(null); }} placeholder="name@example.com" className="application-input mt-2" />
    <p className="mt-2 text-m-footnote leading-5 text-ink-secondary">还没有账户时，验证后会自动创建。</p>
    <button disabled={pending || disabled} className="primary-action mt-3 w-full disabled:opacity-60">{pending ? "发送中…" : "发送验证码"}</button>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-danger-text">{error}</p> : null}
  </form>;
  return <form onSubmit={verify} noValidate>
    <label className="text-sm font-bold" htmlFor={`${id}-code`}>邮箱验证码</label>
    <p role="status" className="mt-1 text-m-footnote leading-5 text-ink-secondary">验证码已发送至 {email}，发件人为 auth@mail.myneon.app。未收到请检查垃圾邮件。</p>
    <input ref={codeInput} id={`${id}-code`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => { setCode(normalizeVerificationCode(event.target.value)); setError(null); }} placeholder="六位验证码" className="application-input mt-2" />
    <button disabled={pending || disabled} className="primary-action mt-3 w-full disabled:opacity-60">{pending ? "验证中…" : accepted.current ? "继续登录" : "验证并登录"}</button>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={pending || cooldown.seconds > 0} onClick={() => void send()} className="min-h-11 px-3 text-sm font-bold text-primary-text disabled:text-ink-secondary">{cooldown.seconds > 0 ? `重新发送（${cooldown.seconds} 秒）` : "重新发送"}</button>
      <button type="button" disabled={pending} onClick={changeEmail} className="min-h-11 px-3 text-sm font-bold text-ink-secondary">修改邮箱</button>
    </div>
    {notice ? <p role="status" className="mt-2 text-m-footnote font-bold text-success-text">{notice}</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm font-bold text-danger-text">{error}</p> : null}
  </form>;
}

const regionLabels: Record<string, string> = { US_CA: "美国/加拿大（+1）", CN: "中国大陆（+86）" };

export function phoneRegionText(regions: string[]) {
  const labels = regions.map((region) => regionLabels[region]).filter(Boolean);
  return labels.length ? `支持${labels.join("、")}手机号。` : "";
}

export function phoneErrorMessage(error: unknown, fallback: string) {
  const productError = toProductApiError(error);
  return productError.code || productError.status === 429 || productError.category === "network" ? productError.message : fallback;
}

function PhoneCodeSignIn({ availability, onRetry, disabled = false, onAuthenticated, accountCreators }: { availability: PhoneAvailability; onRetry: () => void; disabled?: boolean; onAuthenticated: (accessToken: string) => void; accountCreators: string[] }) {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [masked, setMasked] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useMounted();
  const cooldown = useResendCooldown();
  const codeInput = useFocusOnStep(step, "code");
  const id = useId();

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (busy.current || disabled) return;
    const resend = step === "code";
    if (resend && cooldown.seconds > 0) return;
    if (!looksLikePhoneNumber(phone)) { setError("请输入完整的手机号。"); return; }
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try {
      const response = await requestPhoneSignInCode(phone.trim());
      if (!mounted.current) return;
      setMasked(response.phoneNumber); setCode(response.devCode ? normalizeVerificationCode(response.devCode) : ""); setStep("code"); cooldown.start();
      if (resend) setNotice("已重新发送。");
    } catch (caught) { if (mounted.current) setError(phoneErrorMessage(caught, "暂时无法发送验证码，请稍后再试。")); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  async function verify(event: FormEvent) {
    event.preventDefault();
    if (busy.current || disabled) return;
    const normalized = normalizeVerificationCode(code);
    if (normalized.length !== 6) { setError("请输入六位验证码。"); return; }
    const previousToken = readStoredAuthSession()?.accessToken ?? null;
    busy.current = true; setPending(true); setError(null); setNotice(null);
    try {
      const response = await verifyPhoneSignInCode(phone.trim(), normalized);
      if (!mounted.current) return;
      if ((readStoredAuthSession()?.accessToken ?? null) !== previousToken) { setError("账户已在其他页面改变，请刷新后重新登录。"); return; }
      onAuthenticated(response.accessToken);
    } catch (caught) {
      if (!mounted.current) return;
      const productError = toProductApiError(caught);
      setError(productError.status === 401 ? "验证码无效或已过期。请确认号码已绑定 psw 账户，或重新获取验证码。" : phoneErrorMessage(caught, "登录未完成，请重新尝试。"));
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  }

  if (availability.state === "loading") return <p role="status" className="text-sm text-ink-secondary">正在检查手机号登录…</p>;
  if (availability.state === "offline") return <div className="rounded-psw-md bg-surface-subtle px-3 py-3 text-sm leading-6 text-ink">
    <p role="alert">暂时无法连接服务器，请检查网络后重试。</p>
    <button type="button" onClick={onRetry} className="mt-2 min-h-11 px-0 text-sm font-bold text-primary-text">重试</button>
  </div>;
  if (availability.state !== "on") return null;
  if (step === "phone") return <form onSubmit={send} noValidate>
    <label className="text-sm font-bold" htmlFor={`${id}-phone`}>手机号</label>
    <input id={`${id}-phone`} type="tel" autoComplete="tel" inputMode="tel" value={phone} maxLength={24} onChange={(event) => { setPhone(normalizePhoneInput(event.target.value)); setError(null); }} placeholder="+1 415 555 0123" className="application-input mt-2" />
    <p className="mt-2 text-m-footnote leading-5 text-ink-secondary">{phoneRegionText(availability.regions)}手机号需要先在 账户 → 身份与认证 中绑定。{accountCreators.length ? `新用户请先用${joinChoices(accountCreators)}注册。` : ""}</p>
    <button disabled={pending || disabled} className="primary-action mt-3 w-full disabled:opacity-60">{pending ? "发送中…" : "发送短信验证码"}</button>
    {error ? <p role="alert" className="mt-3 text-sm font-bold text-danger-text">{error}</p> : null}
  </form>;
  return <form onSubmit={verify} noValidate>
    <label className="text-sm font-bold" htmlFor={`${id}-sms`}>短信验证码</label>
    <p role="status" className="mt-1 text-m-footnote leading-5 text-ink-secondary">如果 {masked} 已绑定 psw 账户，验证码短信会在一分钟内送达，10 分钟内有效。</p>
    <input ref={codeInput} id={`${id}-sms`} inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => { setCode(normalizeVerificationCode(event.target.value)); setError(null); }} placeholder="六位验证码" className="application-input mt-2" />
    <button disabled={pending || disabled} className="primary-action mt-3 w-full disabled:opacity-60">{pending ? "验证中…" : "验证并登录"}</button>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" disabled={pending || cooldown.seconds > 0} onClick={() => void send()} className="min-h-11 px-3 text-sm font-bold text-primary-text disabled:text-ink-secondary">{cooldown.seconds > 0 ? `重新发送（${cooldown.seconds} 秒）` : "重新发送"}</button>
      <button type="button" disabled={pending} onClick={() => { if (!busy.current) { setStep("phone"); setError(null); setNotice(null); } }} className="min-h-11 px-3 text-sm font-bold text-ink-secondary">修改号码</button>
    </div>
    {notice ? <p role="status" className="mt-2 text-m-footnote font-bold text-success-text">{notice}</p> : null}
    {error ? <p role="alert" className="mt-2 text-sm font-bold text-danger-text">{error}</p> : null}
  </form>;
}

function joinChoices(names: string[]) {
  return names.length > 1 ? `${names.slice(0, -1).join("、")}或${names[names.length - 1]}` : names[0];
}
