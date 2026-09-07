"use client";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  MessageCircle,
  ShieldCheck
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ApplicationCancellation } from "@/components/application-cancellation";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import { PaymentPanel } from "@/components/payment-panel";
import { getSessionUser } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import type { PreviewListing } from "@/lib/preview-data";
import { earliestListingDate, initialListingStay, listingHref, listingStayError, type ListingStay } from "@/lib/listing-stay";
import {
  createAndSubmitRentalApplication,
  applicationDraftScope,
  getMyRentalApplications,
  getRentalApplicationStatusCopy,
  mergeRentalApplicationUpdate,
  newIdempotencyKey,
  validateRentalApplicationDraft,
  withdrawRentalApplication,
  submitRentalApplication,
  type ApiRentalApplication,
  type RentalApplicationDraft
} from "@/lib/rental-applications";
import { cn } from "@/lib/utils";

const applicationSteps = ["基本资料", "租住信息", "身份与材料", "确认提交"];
const applicationDraftVersion = 1;

type ApplicationFormProps = { listing: PreviewListing; initialStay?: Partial<ListingStay>; selectionId?: string };

export function ApplicationFormExperience(props: ApplicationFormProps) {
  const sessionToken = useAuthSessionToken();
  return <ApplicationFormSession key={`${props.listing.id}:${sessionToken ?? "guest"}`} {...props} />;
}

function ApplicationFormSession({ listing, initialStay, selectionId }: ApplicationFormProps) {
  const [requestedStay] = useState(() => initialStay?.moveIn || initialStay?.moveOut ? initialListingStay(listing, initialStay) : null);
  const staySource = useRef(requestedStay ? `${selectionId ?? ""}:${requestedStay.moveIn}:${requestedStay.moveOut}` : "");
  const [step, setStep] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [draft, setDraft] = useState<RentalApplicationDraft>(() => initialApplicationDraft(listing, initialStay));
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<ApiRentalApplication | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const schoolInputRef = useRef<HTMLInputElement>(null);
  const moveInInputRef = useRef<HTMLInputElement>(null);
  const moveOutInputRef = useRef<HTMLInputElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const stepPanelRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    stepPanelRef.current?.focus({ preventScroll: true });
    stepPanelRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [step]);

  useEffect(() => {
    const sessionToken = readStoredAuthSession()?.accessToken ?? null;
    setToken(sessionToken);
    let saved = readApplicationDraft(listing.id, sessionToken);
    if (sessionToken && !saved && consumeApplicationDraftHandoff(listing.id)) {
      saved = readApplicationDraft(listing.id, null);
      if (saved) {
        writeApplicationDraft(listing.id, sessionToken, saved);
        clearApplicationDraft(listing.id, null);
      }
    }
    if (saved) {
      const newStay = requestedStay && saved.staySource !== staySource.current;
      setStep(newStay ? Math.min(saved.step, 1) : saved.step);
      setName(saved.name);
      setEmail(saved.email);
      setDraft(newStay ? { ...saved.draft, ...requestedStay } : saved.draft);
      if (!requestedStay) staySource.current = saved.staySource ?? "";
    }
    setDraftReady(true);
  }, [listing.id, requestedStay]);

  useEffect(() => {
    if (!draftReady || submitted) return;
    writeApplicationDraft(listing.id, token, { step, name, email, draft, staySource: staySource.current });
  }, [draft, draftReady, email, listing.id, name, step, submitted, token]);

  function nextStep() {
    if (!validateThroughStep(step)) return;
    setError(null);
    setStep((current) => Math.min(applicationSteps.length - 1, current + 1));
  }

  function validateThroughStep(through: number) {
    if (!name.trim()) return showError("请填写姓名。", nameInputRef, 0);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showError("请填写有效的联系邮箱。", emailInputRef, 0);
    if (!draft.schoolOrOccupation.trim()) return showError("请填写学校或职业。", schoolInputRef, 0);
    if (draft.schoolOrOccupation.trim().length > 140) return showError("学校或职业不能超过 140 个字符。", schoolInputRef, 0);
    if (through >= 1) {
      const dateError = listingStayError(draft, listing);
      if (dateError) return showError(dateError, dateError.includes("退租") ? moveOutInputRef : moveInInputRef, 1);
    }
    // Later-step edits must stay reachable, including invalid drafts saved before input limits existed.
    if (through >= 2) {
      const [draftError] = validateRentalApplicationDraft(draft, listing);
      if (draftError) return showError(draftError, noteInputRef, 2);
    }
    return true;
  }

  function showError(message: string, target: { current: HTMLElement | null }, targetStep: number) {
    setError(message);
    if (step !== targetStep) {
      setStep(targetStep);
      window.requestAnimationFrame(() => target.current?.focus());
    } else {
      target.current?.focus();
    }
    return false;
  }

  function clearError() {
    if (error) setError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < applicationSteps.length - 1) { nextStep(); return; }
    if (!validateThroughStep(step)) return;
    if (!token) {
      markApplicationDraftHandoff(listing.id);
      window.location.assign(authRoute({ returnTo: `/applications/new?listingId=${encodeURIComponent(listing.id)}`, intent: "application" }));
      return;
    }
    if (readStoredAuthSession()?.accessToken !== token) { setError("登录状态已改变，请刷新页面后继续。"); return; }
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const application = await createAndSubmitRentalApplication(token, listing.id, { ...draft, contactName: name.trim(), contactEmail: email.trim() }, {
        create: newIdempotencyKey("application-create"),
        submit: newIdempotencyKey("application-submit")
      });
      assertCurrentAuthSession(token);
      clearApplicationDraft(listing.id, token);
      clearApplicationDraftHandoff(listing.id);
      setSubmitted(application);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "申请暂时无法提交，请稍后重试。");
    } finally {
      setPending(false);
    }
  }

  if (submitted) {
    return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb] px-4 py-12 sm:px-6"><section className="mx-auto max-w-2xl rounded-[30px] border border-slate-200 bg-white p-8 text-center shadow-xl sm:p-12"><span className="mx-auto grid size-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="size-8" /></span><h1 className="mt-6 text-3xl font-black tracking-[-0.045em]">申请已提交</h1><p className="mt-3 text-sm leading-6 text-slate-500">房东会在消息中心与你联系。状态变化会显示在“我的申请”。</p><div className="mt-7 flex justify-center gap-3"><Link href="/applications" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">查看申请</Link><Link href={`/inbox?listingId=${encodeURIComponent(listing.id)}`} className="rounded-full border border-slate-200 px-5 py-3 text-sm font-black">打开消息</Link></div></section></main>;
  }

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]">
      <div className="mx-auto max-w-[1180px] px-4 py-4 sm:px-6 sm:py-8 lg:px-8 lg:py-12">
        <Link href={listingHref(listing.id, draft)} className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-bold text-slate-600 hover:bg-white"><ArrowLeft className="size-4" />返回房源</Link>
        <div className="mt-3 grid gap-4 sm:mt-5 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <form noValidate onSubmit={submit} className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_20px_65px_rgba(15,23,42,0.08)]">
            <header className="border-b border-slate-200 px-5 py-5 sm:px-8 sm:py-8">
              <p className="hidden text-xs font-black uppercase tracking-[0.15em] text-[#0668e1] sm:block">Rental application</p>
              <h1 className="text-2xl font-black tracking-[-0.045em] sm:mt-2 sm:text-4xl">申请租住</h1>
              <p className="mt-2 hidden text-sm text-slate-500 lg:block">{listing.title}</p>
              {draftReady && !token ? <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900">提交前需要登录，目前仅支持受邀邮箱或已有账户。</p> : null}
              <ol className="mt-4 grid grid-cols-4 gap-2 sm:mt-7" aria-label="申请进度">
                {applicationSteps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className="min-w-0"><div className={cn("h-1.5 rounded-full transition-colors duration-200", index <= step ? "bg-[#0668e1]" : "bg-slate-200")} /><p className={cn("mt-2 text-xs font-bold", index === step ? "text-[#0668e1]" : "text-slate-500")}>{label}</p></li>)}
              </ol>
            </header>

            <div key={step} ref={stepPanelRef} tabIndex={-1} aria-label={`第 ${step + 1} 步：${applicationSteps[step]}`} className="marketplace-step-panel scroll-mt-24 px-5 py-5 outline-none sm:min-h-[420px] sm:px-8 sm:py-7">
              {step === 0 ? <section aria-labelledby="basic-title"><StepHeading id="basic-title" number="01" title="基本资料" detail="这些信息用于房东联系和识别申请。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="姓名"><input ref={nameInputRef} value={name} onChange={(event) => { setName(event.target.value); clearError(); }} className="application-input" maxLength={140} placeholder="你的姓名" /></Field><Field label="联系邮箱"><input ref={emailInputRef} type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }} className="application-input" maxLength={254} placeholder="name@example.com" /></Field><Field label="申请方式"><select value={draft.scope} onChange={(event) => { setDraft({ ...draft, scope: event.target.value as "SOLO" }); clearError(); }} className="application-input"><option value="SOLO">个人申请</option></select></Field><Field label="学校或职业"><input ref={schoolInputRef} value={draft.schoolOrOccupation} onChange={(event) => { setDraft({ ...draft, schoolOrOccupation: event.target.value }); clearError(); }} className="application-input" placeholder="UCLA / Product Intern" /></Field></div></section> : null}
              {step === 1 ? <section aria-labelledby="stay-title"><StepHeading id="stay-title" number="02" title="租住信息" detail="确认日期落在房源可租范围内。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="入住日期"><input ref={moveInInputRef} type="date" min={earliestListingDate(listing)} max={listing.availableTo || undefined} value={draft.moveIn} onChange={(event) => { setDraft({ ...draft, moveIn: event.target.value }); clearError(); }} className="application-input" /></Field><Field label="退租日期"><input ref={moveOutInputRef} type="date" min={draft.moveIn || earliestListingDate(listing)} max={listing.availableTo || undefined} value={draft.moveOut} onChange={(event) => { setDraft({ ...draft, moveOut: event.target.value }); clearError(); }} className="application-input" /></Field><div className="rounded-[18px] bg-blue-50 p-4 text-sm leading-6 text-blue-900 sm:col-span-2"><Info className="mr-2 inline size-4" />房源可租期：{listing.availableFrom} 至 {listing.availableTo}</div></div></section> : null}
              {step === 2 ? <section aria-labelledby="identity-title"><StepHeading id="identity-title" number="03" title="身份与材料" detail="只收集申请所需信息，不要求上传银行流水。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="收入区间"><select value={draft.incomeBand} onChange={(event) => { setDraft({ ...draft, incomeBand: event.target.value as RentalApplicationDraft["incomeBand"] }); clearError(); }} className="application-input"><option value="BELOW_2X">低于月租 2 倍</option><option value="TWO_TO_THREE_X">月租 2–3 倍</option><option value="THREE_TO_FOUR_X">月租 3–4 倍</option><option value="ABOVE_FOUR_X">高于月租 4 倍</option><option value="PREFER_NOT_TO_SAY">不愿透露</option></select></Field><Field label="担保人情况"><select value={draft.guarantorStatus} onChange={(event) => { setDraft({ ...draft, guarantorStatus: event.target.value as RentalApplicationDraft["guarantorStatus"] }); clearError(); }} className="application-input"><option value="AVAILABLE">可提供</option><option value="NOT_AVAILABLE">无法提供</option><option value="NOT_NEEDED">不需要</option></select></Field><Field label="补充说明" className="sm:col-span-2"><textarea ref={noteInputRef} aria-label="补充说明" maxLength={1000} aria-describedby="application-note-count" aria-invalid={draft.note.trim().length > 1000 || undefined} value={draft.note} onChange={(event) => { setDraft({ ...draft, note: event.target.value }); clearError(); }} className="application-input min-h-28 resize-none py-3" placeholder="介绍入住计划或想让房东了解的信息…" /><span id="application-note-count" className={cn("text-right text-xs font-medium", draft.note.trim().length > 1000 ? "text-red-700" : "text-slate-500")}>{draft.note.length} / 1000 字符</span></Field></div></section> : null}
              {step === 3 ? <section aria-labelledby="review-title"><StepHeading id="review-title" number="04" title="确认提交" detail="检查信息无误后提交给房东。" /><div className="mt-7 divide-y divide-slate-200 rounded-[22px] border border-slate-200"><ReviewRow label="申请人" value={`${name} · ${email}`} /><ReviewRow label="租期" value={`${draft.moveIn} 至 ${draft.moveOut}`} /><ReviewRow label="学校或职业" value={draft.schoolOrOccupation} /><ReviewRow label="收入区间" value={incomeBandLabel(draft.incomeBand)} /><ReviewRow label="担保人" value={guarantorLabel(draft.guarantorStatus)} /><ReviewRow label="补充说明" value={draft.note.trim() || "未填写"} /><ReviewRow label="申请费用" value="$0" /></div><p className="mt-5 flex gap-2 text-xs leading-5 text-slate-500"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />提交后进入房东审核；只有房东接受申请后才进入后续付款流程。</p></section> : null}
              {error ? <p id="application-error" role="alert" className="mt-5 rounded-[16px] bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error} <Link href="/applications" className="underline">查看我的申请</Link></p> : null}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4 sm:px-8">
              <button type="button" onClick={() => { setError(null); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || pending} className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-black text-slate-600 disabled:opacity-0"><ArrowLeft className="size-4" />上一步</button>
              {step < applicationSteps.length - 1 ? <button key="application-next" type="submit" className="flex items-center gap-2 rounded-full bg-[#0668e1] px-6 py-3 text-sm font-black text-white">继续<ArrowRight className="size-4" /></button> : <button key="application-submit" type="submit" disabled={pending} className="rounded-full bg-[#0668e1] px-6 py-3 text-sm font-black text-white disabled:opacity-50">{pending ? "提交中…" : "提交申请"}</button>}
            </footer>
          </form>

          <aside aria-label="申请房源摘要" className="order-first rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[96px] lg:order-last">
            <div className="flex items-center gap-3 lg:block">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-2xl bg-slate-200 lg:aspect-[4/3] lg:h-auto lg:w-full"><Image src={listing.image} alt={listing.title} fill sizes="(max-width: 1023px) 64px, 340px" className="object-cover" /></div>
              <div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-bold leading-snug lg:mt-4 lg:text-base">{listing.title}</h2><p className="mt-1 hidden text-xs text-slate-500 lg:block">{listing.area}</p>
                <p className="mt-2 text-lg font-black lg:mt-4 lg:border-t lg:border-slate-200 lg:pt-4 lg:text-xl">${listing.price.toLocaleString()} <span className="text-xs font-medium text-slate-500">/ 月</span></p>
                <p className="mt-3 hidden text-xs leading-5 text-slate-500 lg:block">所选租期<br /><span className="font-semibold text-slate-700">{draft.moveIn || "待选择"} 至 {draft.moveOut || "待选择"}</span></p>
              </div>
            </div>
            <details className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-600 lg:hidden"><summary className="cursor-pointer font-bold">查看租期与位置</summary><p className="mt-2 leading-5">{listing.area}<br />{draft.moveIn || "待选择入住日期"} 至 {draft.moveOut || "待选择退租日期"}</p></details>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function ApplicationsExperience() {
  const token = useAuthSessionToken();
  return <ApplicationsSession key={token ?? "guest"} />;
}

function ApplicationsSession() {
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const token = readStoredAuthSession()?.accessToken;
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setAuthenticated(true);
    setLoading(true);
    getMyRentalApplications(token).then((items) => {
      if (!cancelled) setApplications(items.filter((item) => item.status !== "ACCEPTED" && item.status !== "COMPLETED"));
    }).catch((error) => {
      if (!cancelled) setLoadError(error instanceof Error ? error.message : "申请状态暂时无法加载。");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb]">
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <div className="flex flex-col justify-between gap-6 border-b border-slate-200 pb-7 sm:flex-row sm:items-end"><div><p className="text-xs font-black uppercase tracking-[0.15em] text-[#0668e1]">Application center</p><h1 className="mt-2 text-4xl font-black tracking-[-0.05em] sm:text-5xl">我的申请</h1><p className="mt-3 text-sm text-slate-500">草稿、已提交和需要补充的申请都在这里。</p></div><Link href="/trips" className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700">查看已接受的租住<ChevronRight className="size-4" /></Link></div>
        <div className="mt-7 grid gap-5">
          {applications.map((application, index) => {
            const copy = getRentalApplicationStatusCopy(application.status);
            const statusLabel = application.status === "SUBMITTED" ? "审核中" : copy.label;
            return <article key={application.id} className="grid gap-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"><div className="flex min-w-0 gap-4"><span className={cn("grid size-12 shrink-0 place-items-center rounded-[16px]", index === 0 ? "bg-blue-50 text-[#0668e1]" : "bg-slate-100 text-slate-500")}><FileText className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-lg font-black">{application.listingTitle}</h2><span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", application.status === "SUBMITTED" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600")}>{statusLabel}</span></div><p className="mt-2 text-sm text-slate-500">{application.moveIn.slice(0, 10)} 至 {application.moveOut.slice(0, 10)} · 个人申请</p><div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-500"><Clock3 className="size-3.5" />{copy.description}</div></div></div><div className="flex items-center gap-2 sm:justify-end"><Link href={`/inbox?listingId=${encodeURIComponent(application.listingId)}`} className="grid size-10 place-items-center rounded-full border border-slate-200" aria-label="打开相关消息"><MessageCircle className="size-4" /></Link><Link href={`/applications/${encodeURIComponent(application.id)}`} className="flex items-center gap-1 rounded-full bg-slate-950 px-4 py-2.5 text-xs font-black text-white">查看详情<ChevronRight className="size-3.5" /></Link></div></article>;
          })}
          {!loading && !authenticated ? <EmptyApplications title="登录后查看真实申请状态" detail="登录后可查看草稿、审核进度和房东决定。" actionHref={authRoute({ returnTo: "/applications" })} action="登录" /> : null}
          {!loading && authenticated && applications.length === 0 && !loadError ? <EmptyApplications title="还没有申请" detail="找到合适房源后，可以从房源详情页发起申请。" actionHref="/search" action="浏览房源" /> : null}
          {loadError ? <p role="alert" className="rounded-[18px] bg-red-50 px-5 py-4 text-sm font-bold text-red-700">{loadError}</p> : null}
        </div>
        {loading ? <p className="mt-5 text-center text-xs font-bold text-slate-400">正在同步申请状态…</p> : null}
      </div>
    </main>
  );
}

export function ApplicationDetailExperience({ applicationId }: { applicationId: string }) {
  const token = useAuthSessionToken();
  return <ApplicationDetailSession key={`${applicationId}:${token ?? "guest"}`} applicationId={applicationId} />;
}

function ApplicationDetailSession({ applicationId }: { applicationId: string }) {
  const [application, setApplication] = useState<ApiRentalApplication | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const accessToken = readStoredAuthSession()?.accessToken;
    if (!accessToken) return;
    setToken(accessToken);
    setAuthenticated(true);
    setLoading(true);
    Promise.all([getMyRentalApplications(accessToken), getSessionUser(accessToken)])
      .then(([items, user]) => {
        setApplication(items.find((item) => item.id === applicationId) ?? null);
        setCurrentUserId(user.id);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "申请详情暂时无法加载。"))
      .finally(() => setLoading(false));
  }, [applicationId]);

  async function continueDraft() {
    if (!token || !application || currentUserId !== application.submitterId) return;
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const items = await getMyRentalApplications(token);
      assertCurrentAuthSession(token);
      const current = items.find((item) => item.id === application.id);
      if (!current) throw new Error("找不到申请。");
      setApplication(current.status === "DRAFT"
        ? mergeRentalApplicationUpdate(current, await submitRentalApplication(token, current.id, `application-submit-${current.id}`))
        : current);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交失败，请重试。");
    }
  }

  async function withdraw() {
    if (!token || !application || !window.confirm("确认撤回这份申请？")) return;
    try {
      assertCurrentAuthSession(token);
      setApplication(await withdrawRentalApplication(token, application.id, `applicant-withdraw-${application.id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "撤回失败，请重试。");
    }
  }

  return <main className="min-h-[calc(100dvh-72px)] bg-[#f7f8fb] px-4 py-10 sm:px-6"><div className="mx-auto max-w-4xl"><Link href="/applications" className="text-sm font-black text-slate-600">← 返回我的申请</Link>{!authenticated ? <section className="mt-6 rounded-[26px] border border-dashed border-slate-300 bg-white p-10 text-center"><h1 className="text-xl font-black">登录后查看真实申请详情</h1><Link href={authRoute({ returnTo: `/applications/${applicationId}` })} className="mt-5 inline-flex rounded-full bg-[#0668e1] px-5 py-3 text-sm font-black text-white">登录</Link></section> : null}{loading ? <p className="mt-6 text-center text-sm text-slate-500">正在加载申请…</p> : null}{error ? <p role="alert" className="mt-6 rounded-[16px] bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p> : null}{authenticated && !loading && !application && !error ? <p className="mt-6 rounded-[24px] border border-dashed border-slate-300 bg-white p-10 text-center text-sm font-bold text-slate-500">找不到这份申请，或你无权查看。</p> : null}{application ? <section className="mt-5 space-y-5"><div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[.14em] text-[#0668e1]">Application · {application.id}</p><h1 className="mt-3 text-3xl font-black">{application.listingTitle ?? "房源申请"}</h1><p className="mt-2 text-sm text-slate-500">{application.moveIn.slice(0,10)} 至 {application.moveOut.slice(0,10)}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{getRentalApplicationStatusCopy(application.status).label}</span></div><div className="mt-7 grid gap-4 sm:grid-cols-2">{application.contactName ? <ReviewRow label="联系人" value={application.contactName} /> : null}{application.contactEmail ? <ReviewRow label="联系邮箱" value={application.contactEmail} /> : null}<ReviewRow label="学校或职业" value={application.schoolOrOccupation} /><ReviewRow label="担保人" value={guarantorLabel(application.guarantorStatus)} /><ReviewRow label="申请方式" value={application.scope === "TEAM" ? "小组" : "个人"} /><ReviewRow label="当前状态" value={getRentalApplicationStatusCopy(application.status).description} /></div>{application.note ? <p className="mt-6 rounded-[18px] bg-slate-50 p-4 text-sm text-slate-600">{application.note}</p> : null}<div className="mt-7 flex flex-wrap gap-3"><Link href={`/inbox?listingId=${encodeURIComponent(application.listingId)}`} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">打开相关消息</Link>{application.status === "DRAFT" && currentUserId === application.submitterId ? <button onClick={() => void continueDraft()} className="rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white">继续提交</button> : null}{(application.status === "SUBMITTED" || application.status === "DRAFT") && currentUserId === application.submitterId ? <button onClick={() => void withdraw()} className="rounded-full border border-red-200 px-5 py-3 text-sm font-black text-red-600">撤回申请</button> : null}</div>{token && currentUserId ? <ApplicationCancellation application={application} token={token} currentUserId={currentUserId} onApplicationChange={(updated) => setApplication((current) => current ? mergeRentalApplicationUpdate(current, updated) : updated)} /> : null}</div>{token && currentUserId && (application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" || application.status === "CANCELLED") ? <PaymentPanel application={application} token={token} currentUserId={currentUserId} onApplicationChange={(updated) => setApplication((current) => current ? mergeRentalApplicationUpdate(current, updated) : updated)} /> : null}</section> : null}</div></main>;
}

type SavedApplicationDraft = {
  step: number;
  name: string;
  email: string;
  draft: RentalApplicationDraft;
  staySource?: string;
};

function applicationDraftKey(listingId: string, token: string | null) {
  return `sublet_application_draft:${applicationDraftScope(token)}:${listingId}`;
}


function applicationDraftHandoffKey(listingId: string) {
  return `sublet_application_draft_handoff:${listingId}`;
}

function writeApplicationDraft(listingId: string, token: string | null, value: SavedApplicationDraft) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(applicationDraftKey(listingId, token), JSON.stringify({ version: applicationDraftVersion, ...value }));
}

function readApplicationDraft(listingId: string, token: string | null): SavedApplicationDraft | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(applicationDraftKey(listingId, token));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SavedApplicationDraft> & { version?: number };
    if (value.version !== applicationDraftVersion || typeof value.step !== "number" || value.step < 0 || value.step >= applicationSteps.length || typeof value.name !== "string" || typeof value.email !== "string" || !isRentalApplicationDraft(value.draft)) return null;
    return { step: value.step, name: value.name, email: value.email, draft: value.draft, staySource: typeof value.staySource === "string" ? value.staySource : undefined };
  } catch {
    return null;
  }
}

function clearApplicationDraft(listingId: string, token: string | null) {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(applicationDraftKey(listingId, token));
}

function markApplicationDraftHandoff(listingId: string) {
  if (typeof window !== "undefined") window.sessionStorage.setItem(applicationDraftHandoffKey(listingId), "1");
}

function consumeApplicationDraftHandoff(listingId: string) {
  if (typeof window === "undefined") return false;
  const key = applicationDraftHandoffKey(listingId);
  const exists = window.sessionStorage.getItem(key) === "1";
  if (exists) window.sessionStorage.removeItem(key);
  return exists;
}

function clearApplicationDraftHandoff(listingId: string) {
  if (typeof window !== "undefined") window.sessionStorage.removeItem(applicationDraftHandoffKey(listingId));
}

function isRentalApplicationDraft(value: unknown): value is RentalApplicationDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RentalApplicationDraft>;
  return draft.scope === "SOLO" && [draft.moveIn, draft.moveOut, draft.schoolOrOccupation, draft.note].every((item) => typeof item === "string") && typeof draft.incomeBand === "string" && typeof draft.guarantorStatus === "string";
}

function initialApplicationDraft(listing: PreviewListing, stay?: Partial<ListingStay>): RentalApplicationDraft {
  return {
    scope: "SOLO",
    ...initialListingStay(listing, stay),
    schoolOrOccupation: "",
    incomeBand: "TWO_TO_THREE_X",
    guarantorStatus: "AVAILABLE",
    note: ""
  };
}

function incomeBandLabel(band: RentalApplicationDraft["incomeBand"]) {
  return { BELOW_2X: "低于月租 2 倍", TWO_TO_THREE_X: "月租 2–3 倍", THREE_TO_FOUR_X: "月租 3–4 倍", ABOVE_FOUR_X: "高于月租 4 倍", PREFER_NOT_TO_SAY: "不愿透露" }[band];
}

function guarantorLabel(status: ApiRentalApplication["guarantorStatus"]) {
  return { AVAILABLE: "可提供", NOT_AVAILABLE: "无法提供", NOT_NEEDED: "不需要" }[status];
}

function EmptyApplications({ title, detail, actionHref, action }: { title: string; detail: string; actionHref: string; action: string }) {
  return <section className="rounded-[26px] border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><h2 className="text-xl font-black">{title}</h2><p className="mt-2 text-sm text-slate-500">{detail}</p><Link href={actionHref} className="mt-5 inline-flex rounded-full bg-[#0668e1] px-5 py-3 text-sm font-black text-white">{action}</Link></section>;
}

function StepHeading({ id, number, title, detail }: { id: string; number: string; title: string; detail: string }) {
  return <div><span className="text-xs font-black text-[#0668e1]">{number} / 04</span><h2 id={id} className="mt-2 text-2xl font-black tracking-[-0.035em]">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{detail}</p></div>;
}

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return <label className={cn("grid gap-2 text-sm font-black text-slate-700", className)}>{label}{children}</label>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6 sm:py-4"><span className="font-semibold text-slate-500">{label}</span><span className="min-w-0 whitespace-pre-wrap text-right font-black text-slate-900 [overflow-wrap:anywhere]">{value}</span></div>;
}
