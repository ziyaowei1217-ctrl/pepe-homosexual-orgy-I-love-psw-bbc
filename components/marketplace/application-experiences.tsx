"use client";

import { signInViaPhrase } from "@/lib/auth-methods";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Clock3,
  FileText,
  Info,
  MessageCircle,
  ShieldCheck
} from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";

import { ApplicationCancellation } from "@/components/application-cancellation";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import { PaymentPanel } from "@/components/payment-panel";
import { getSessionUser } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { usesNeonAuth } from "@/lib/neon-auth-client";
import type { PreviewListing } from "@/lib/preview-data";
import { formatRangeLong } from "@/lib/date-format";
import { earliestListingDate, initialListingStay, listingHref, listingStayError, type ListingStay } from "@/lib/listing-stay";
import { formatStayLength, formatUsd, stayPrice } from "@/lib/stay-price";
import { loadMarketplaceListing } from "@/lib/marketplace-data";
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
import { useConfirm } from "@/components/marketplace/confirm-dialog";
import { DateInput } from "@/components/ui/date-input";

// Four characters each, so the step labels never break on a phone.
const applicationSteps = ["基本资料", "租住信息", "身份材料", "确认提交"];

type ApplicationField = "name" | "email" | "school" | "moveIn" | "moveOut" | "note";
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
  // A field's error sits under that field; `error` is only for submission problems.
  const [fieldError, setFieldError] = useState<{ field: ApplicationField; message: string } | null>(null);
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
    setFieldError(null);
    setStep((current) => Math.min(applicationSteps.length - 1, current + 1));
  }

  function validateThroughStep(through: number) {
    if (!name.trim()) return showError("请填写姓名。", nameInputRef, 0, "name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showError("请填写有效的联系邮箱。", emailInputRef, 0, "email");
    if (!draft.schoolOrOccupation.trim()) return showError("请填写学校或职业。", schoolInputRef, 0, "school");
    if (draft.schoolOrOccupation.trim().length > 140) return showError("学校或职业不能超过 140 个字符。", schoolInputRef, 0, "school");
    if (through >= 1) {
      const dateError = listingStayError(draft, listing);
      if (dateError) {
        const field = dateError.includes("退租") ? "moveOut" : "moveIn";
        return showError(dateError, field === "moveOut" ? moveOutInputRef : moveInInputRef, 1, field);
      }
    }
    // Later-step edits must stay reachable, including invalid drafts saved before input limits existed.
    if (through >= 2) {
      const [draftError] = validateRentalApplicationDraft(draft, listing);
      if (draftError) return showError(draftError, noteInputRef, 2, "note");
    }
    return true;
  }

  function showError(message: string, target: { current: HTMLElement | null }, targetStep: number, field: ApplicationField) {
    setError(null);
    setFieldError({ field, message });
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
    if (fieldError) setFieldError(null);
  }

  /** Error props for one field: marks it invalid and points it at the message under it. */
  function invalid(field: ApplicationField, describedBy?: string) {
    const own = fieldError?.field === field;
    const ids = [describedBy, own ? "application-field-error" : ""].filter(Boolean).join(" ");
    return { "aria-invalid": own || undefined, "aria-describedby": ids || undefined };
  }
  const errorFor = (field: ApplicationField) => fieldError?.field === field ? fieldError.message : undefined;
  const stayTotal = listingStayError(draft, listing) ? null : stayPrice(listing.price, draft.moveIn, draft.moveOut);
  const stayRange = draft.moveIn && draft.moveOut ? formatRangeLong(draft.moveIn, draft.moveOut) : "还没选日期";

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
    return <SubmittedApplication listing={listing} />;
  }


  return (
    <main className="min-h-[calc(100dvh-72px)] bg-background">
      <div className="page-container pb-16 pt-4 sm:pt-8">
        <Link href={listingHref(listing.id, draft)} className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold text-ink-secondary hover:bg-surface sm:text-sm"><ArrowLeft className="size-4" aria-hidden="true" />返回房源</Link>
        <div className="mt-3 grid gap-4 sm:mt-5 sm:gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <form noValidate onSubmit={submit} className="overflow-hidden rounded-psw-xl bg-surface">
            <header className="border-b border-line-strong px-5 py-5 sm:px-8 sm:py-8">
              <h1 className="page-title">申请租住</h1>
              <p className="mt-2 hidden text-d-subhead text-ink-secondary lg:block">{listing.title}</p>
              {draftReady && !token ? <p className="mt-3 rounded-psw-md bg-primary-soft px-3 py-2 text-m-footnote text-ink">{usesNeonAuth() ? `提交前需要${signInViaPhrase()}。` : "提交前需要登录，目前仅支持受邀邮箱或已有账户。"}</p> : null}
              <ol className="mt-4 grid grid-cols-4 gap-2 sm:mt-7" aria-label="申请进度">
                {applicationSteps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined} className="min-w-0"><div className={cn("h-1.5 rounded-full transition-colors duration-200", index <= step ? "bg-primary" : "bg-line-strong")} /><p className={cn("mt-2 text-m-footnote font-bold", index === step ? "text-primary-text" : "text-ink-secondary")}>{label}</p></li>)}
              </ol>
            </header>

            <div key={step} ref={stepPanelRef} tabIndex={-1} aria-label={`第 ${step + 1} 步：${applicationSteps[step]}`} className="marketplace-step-panel scroll-mt-24 px-5 py-5 outline-none sm:min-h-[420px] sm:px-8 sm:py-7">
              {step === 0 ? <section aria-labelledby="basic-title"><StepHeading id="basic-title" number="01" title="基本资料" detail="这些信息用于转租人联系和识别申请。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="姓名" error={errorFor("name")}><input ref={nameInputRef} {...invalid("name")} value={name} onChange={(event) => { setName(event.target.value); clearError(); }} className="application-input" maxLength={140} placeholder="你的姓名" /></Field><Field label="联系邮箱" error={errorFor("email")}><input ref={emailInputRef} {...invalid("email")} type="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError(); }} className="application-input" maxLength={254} placeholder="name@example.com" /></Field><Field label="申请方式"><select value={draft.scope} onChange={(event) => { setDraft({ ...draft, scope: event.target.value as "SOLO" }); clearError(); }} className="application-input"><option value="SOLO">个人申请</option></select></Field><Field label="学校或职业" error={errorFor("school")}><input ref={schoolInputRef} {...invalid("school")} value={draft.schoolOrOccupation} onChange={(event) => { setDraft({ ...draft, schoolOrOccupation: event.target.value }); clearError(); }} className="application-input" placeholder="UCLA / Product Intern" /></Field></div></section> : null}
              {step === 1 ? <section aria-labelledby="stay-title"><StepHeading id="stay-title" number="02" title="租住信息" detail="确认日期落在房源可租范围内。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="入住日期" error={errorFor("moveIn")}><DateInput ref={moveInInputRef} aria-label="入住日期" {...invalid("moveIn")} min={earliestListingDate(listing)} max={listing.availableTo || undefined} value={draft.moveIn} onChange={(event) => { setDraft({ ...draft, moveIn: event.target.value }); clearError(); }} className="application-input flex items-center peer-aria-[invalid=true]:border-danger" /></Field><Field label="退租日期" error={errorFor("moveOut")}><DateInput ref={moveOutInputRef} aria-label="退租日期" {...invalid("moveOut")} min={draft.moveIn || earliestListingDate(listing)} max={listing.availableTo || undefined} value={draft.moveOut} onChange={(event) => { setDraft({ ...draft, moveOut: event.target.value }); clearError(); }} className="application-input flex items-center peer-aria-[invalid=true]:border-danger" /></Field><div className="rounded-psw-lg bg-surface-subtle p-4 text-sm leading-6 text-ink sm:col-span-2"><Info className="mr-2 inline size-4" aria-hidden="true" />可租日期：{listing.availableFrom && listing.availableTo ? formatRangeLong(earliestListingDate(listing), listing.availableTo) : "请联系转租人确认"}</div></div></section> : null}
              {step === 2 ? <section aria-labelledby="identity-title"><StepHeading id="identity-title" number="03" title="身份与材料" detail="只收集申请所需信息，不要求上传银行流水。" /><div className="mt-5 grid gap-4 sm:mt-7 sm:gap-5 sm:grid-cols-2"><Field label="收入区间"><select value={draft.incomeBand} onChange={(event) => { setDraft({ ...draft, incomeBand: event.target.value as RentalApplicationDraft["incomeBand"] }); clearError(); }} className="application-input"><option value="BELOW_2X">低于月租 2 倍</option><option value="TWO_TO_THREE_X">月租 2–3 倍</option><option value="THREE_TO_FOUR_X">月租 3–4 倍</option><option value="ABOVE_FOUR_X">高于月租 4 倍</option><option value="PREFER_NOT_TO_SAY">不愿透露</option></select></Field><Field label="担保人情况"><select value={draft.guarantorStatus} onChange={(event) => { setDraft({ ...draft, guarantorStatus: event.target.value as RentalApplicationDraft["guarantorStatus"] }); clearError(); }} className="application-input"><option value="AVAILABLE">可提供</option><option value="NOT_AVAILABLE">无法提供</option><option value="NOT_NEEDED">不需要</option></select></Field><Field label="补充说明" className="sm:col-span-2" error={errorFor("note")}><textarea ref={noteInputRef} aria-label="补充说明" maxLength={1000} {...invalid("note", "application-note-count")} aria-invalid={draft.note.trim().length > 1000 || fieldError?.field === "note" || undefined} value={draft.note} onChange={(event) => { setDraft({ ...draft, note: event.target.value }); clearError(); }} className="application-input min-h-28 resize-none py-3" placeholder="介绍入住计划或想让转租人了解的信息…" /><span id="application-note-count" className={cn("text-right text-m-footnote font-medium", draft.note.trim().length > 1000 ? "text-danger-text" : "text-ink-secondary")}>{draft.note.length} / 1000 字符</span></Field></div></section> : null}
              {step === 3 ? <section aria-labelledby="review-title"><StepHeading id="review-title" number="04" title="确认提交" detail="检查信息无误后提交给转租人。" /><div className="mt-7 divide-y divide-line-strong rounded-psw-xl border border-line-strong"><ReviewRow label="申请人" value={`${name} · ${email}`} /><ReviewRow label="租期" value={stayRange} />{stayTotal ? <ReviewRow label="房租总价" value={`${formatUsd(stayTotal.total)} · ${formatStayLength(stayTotal)}`} /> : null}<ReviewRow label="学校或职业" value={draft.schoolOrOccupation} /><ReviewRow label="收入区间" value={incomeBandLabel(draft.incomeBand)} /><ReviewRow label="担保人" value={guarantorLabel(draft.guarantorStatus)} /><ReviewRow label="补充说明" value={draft.note.trim() || "未填写"} /><ReviewRow label="申请费用" value="$0" /></div><p className="mt-5 flex gap-2 text-m-footnote leading-5 text-ink-secondary"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary-text" />提交后进入转租人审核；只有转租人接受申请后才进入后续付款流程。</p></section> : null}
              {error ? <p id="application-error" role="alert" className="mt-5 rounded-psw-md bg-danger-soft px-4 py-3 text-d-subhead font-semibold text-danger-text">{error} <Link href="/applications" className="underline">查看我的申请</Link></p> : null}
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-line-strong px-5 py-4 sm:px-8">
              <button type="button" onClick={() => { setError(null); setFieldError(null); setStep((current) => Math.max(0, current - 1)); }} disabled={step === 0 || pending} className="flex items-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-ink-secondary disabled:opacity-0"><ArrowLeft className="size-4" />上一步</button>
              {step < applicationSteps.length - 1 ? <button key="application-next" type="submit" className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-white">继续<ArrowRight className="size-4" /></button> : <button key="application-submit" type="submit" disabled={pending} className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{pending ? "提交中…" : "提交申请"}</button>}
            </footer>
          </form>

          <aside aria-label="申请房源摘要" className="order-first rounded-psw-xl border border-line-strong bg-surface p-4 lg:sticky lg:top-[96px] lg:order-last">
            <div className="flex items-center gap-3 lg:block">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-psw-lg bg-line-strong lg:aspect-[4/3] lg:h-auto lg:w-full"><SmartImage src={listing.image} alt={listing.title} fill sizes="(max-width: 1023px) 64px, 340px" className="object-cover" /></div>
              <div className="min-w-0 flex-1"><h2 className="line-clamp-2 text-sm font-bold leading-snug lg:mt-4 lg:text-base">{listing.title}</h2><p className="mt-1 hidden text-m-footnote text-ink-secondary lg:block">{listing.area}</p>
                {stayTotal ? <div className="mt-2 lg:mt-4 lg:border-t lg:border-line-strong lg:pt-4">
                  <p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-m-footnote text-ink-secondary">总价</span><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{formatUsd(stayTotal.total)}</span><span className="text-m-footnote text-ink-secondary">· {formatStayLength(stayTotal)}</span></p>
                  <p className="text-m-footnote text-ink-secondary">月租 {formatUsd(listing.price)}</p>
                </div> : <p className="mt-2 lg:mt-4 lg:border-t lg:border-line-strong lg:pt-4"><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{formatUsd(listing.price)}</span><span className="ml-1 text-m-footnote text-ink-secondary">/ 月</span></p>}
                <p className="mt-3 hidden text-m-footnote text-ink-secondary lg:block">你的日期<br /><span className="font-semibold text-ink">{stayRange}</span></p>
              </div>
            </div>
            <details className="mt-3 border-t border-line pt-3 text-m-footnote text-ink-secondary lg:hidden"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">查看日期与位置</summary><p className="pb-1">{listing.area}<br />{stayRange}</p></details>
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
  const [attempt, setAttempt] = useState(0);

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
  }, [attempt]);

  return (
    <main className="min-h-[calc(100dvh-72px)] bg-background">
      <div className="page-container pb-16 pt-8 sm:pt-12">
        <PageHeader title="我的申请" description="草稿、已提交和需要补充的申请都在这里。" action={authenticated ? <Link href="/trips" className="secondary-action">查看已接受的租住<ChevronRight className="size-4" aria-hidden="true" /></Link> : undefined} />
        <div className="mt-7 grid gap-5">
          {applications.map((application, index) => {
            const copy = getRentalApplicationStatusCopy(application.status);
            const statusLabel = application.status === "SUBMITTED" ? "审核中" : copy.label;
            return <article key={application.id} className="grid gap-5 rounded-psw-xl bg-surface p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"><div className="flex min-w-0 gap-4"><span className={cn("grid size-12 shrink-0 place-items-center rounded-psw-lg", index === 0 ? "bg-surface-subtle text-primary-text" : "bg-tag-neutral text-ink-secondary")}><FileText className="size-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-m-headline sm:text-d-headline font-bold">{application.listingTitle}</h2><span className={cn("rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", application.status === "SUBMITTED" ? "bg-warning-soft text-warning-text" : "bg-tag-neutral text-ink-secondary")}>{statusLabel}</span></div><p className="mt-2 text-sm text-ink-secondary">{formatRangeLong(application.moveIn.slice(0, 10), application.moveOut.slice(0, 10))} · {application.scope === "TEAM" ? "小组申请" : "个人申请"}</p><div className="mt-4 flex items-center gap-2 text-m-footnote font-bold text-ink-secondary"><Clock3 className="size-3.5" />{copy.description}</div></div></div><div className="flex items-center gap-2 sm:justify-end"><Link href={`/inbox?listingId=${encodeURIComponent(application.listingId)}`} className="grid size-10 place-items-center rounded-full border border-line-strong" aria-label="打开相关消息"><MessageCircle className="size-4" /></Link><Link href={`/applications/${encodeURIComponent(application.id)}`} className="flex items-center gap-1 rounded-full bg-primary px-4 py-2.5 font-rounded text-m-footnote font-bold text-white hover:bg-primary-hover">查看详情<ChevronRight className="size-3.5" /></Link></div></article>;
          })}
          {!loading && !authenticated ? <EmptyApplications title="登录后查看你的申请" detail="登录后可查看草稿、审核进度和转租人决定。" actionHref={authRoute({ returnTo: "/applications" })} action="登录" /> : null}
          {!loading && authenticated && applications.length === 0 && !loadError ? <EmptyApplications title="还没有申请" detail="找到合适房源后，可以从房源详情页发起申请。" actionHref="/search" action="浏览房源" /> : null}
          {loadError ? <div role="alert"><EmptyState mood="sorry" title="申请没加载出来" body={loadError} action={<button type="button" onClick={() => { setLoadError(null); setAttempt((value) => value + 1); }} className="primary-action">重试</button>} /></div> : null}
        </div>
        {loading ? <p className="mt-5 text-center text-m-footnote font-bold text-ink-placeholder">正在同步申请状态…</p> : null}
      </div>
    </main>
  );
}

export function ApplicationDetailExperience({ applicationId }: { applicationId: string }) {
  const token = useAuthSessionToken();
  return <ApplicationDetailSession key={`${applicationId}:${token ?? "guest"}`} applicationId={applicationId} />;
}

function ApplicationDetailSession({ applicationId }: { applicationId: string }) {
  const [confirmDialog, confirm] = useConfirm();
  const [application, setApplication] = useState<ApiRentalApplication | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The listing gives the monthly rent, so the page can show what these dates cost before anyone pays.
  const [listing, setListing] = useState<PreviewListing | null>(null);

  useEffect(() => {
    if (!application?.listingId) return;
    let cancelled = false;
    loadMarketplaceListing(application.listingId).then((item) => { if (!cancelled) setListing(item); }).catch(() => { /* The page works without the price. */ });
    return () => { cancelled = true; };
  }, [application?.listingId]);

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
  }, [applicationId, attempt]);

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
    if (!token || !application) return;
    if (await confirm({ title: "撤回这份申请？", body: "撤回后这份申请就结束了。想再租这个房间，需要重新申请。", confirmLabel: "撤回申请", tone: "danger" }) === false) return;
    try {
      assertCurrentAuthSession(token);
      setApplication(await withdrawRentalApplication(token, application.id, `applicant-withdraw-${application.id}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "撤回失败，请重试。");
    }
  }

  const status = application ? getRentalApplicationStatusCopy(application.status) : null;
  const ownApplication = Boolean(application && currentUserId === application.submitterId);
  // Withdrawn, rejected and cancelled applications will not be paid, so they do not show what the dates would cost.
  const ended = Boolean(application && ["WITHDRAWN", "REJECTED", "CANCELLED"].includes(application.status));
  const stayTotal = application && listing && !ended ? stayPrice(listing.price, application.moveIn.slice(0, 10), application.moveOut.slice(0, 10)) : null;
  const hasPayment = Boolean(application && ["ACCEPTED", "COMPLETED", "CANCELLATION_PENDING", "CANCELLED"].includes(application.status));
  return <main className="min-h-[calc(100dvh-72px)] bg-background"><div className="page-container max-w-[880px] pb-16 pt-4 sm:pt-8">
    <Link href="/applications" className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-[15px] font-bold text-ink-secondary hover:bg-surface sm:text-sm"><ArrowLeft className="size-4" aria-hidden="true" />返回我的申请</Link>
    {!authenticated ? <EmptyApplications title="登录后查看这份申请" detail={usesNeonAuth() ? `${signInViaPhrase()}后查看这份申请。` : "用邮箱验证码登录，不需要密码。"} actionHref={authRoute({ returnTo: `/applications/${applicationId}` })} action="登录" /> : null}
    {loading ? <p role="status" className="mt-6 text-center text-d-subhead text-ink-secondary">正在加载申请…</p> : null}
    {error && !application ? <div role="alert" className="mt-6"><EmptyState mood="sorry" title="申请没加载出来" body={error} action={<button type="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }} className="primary-action">重试</button>} /></div> : null}
    {error && application ? <p role="alert" className="mt-6 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{error}</p> : null}
    {authenticated && !loading && !application && !error ? <EmptyApplications title="找不到这份申请" detail="可能已经撤回，或者你没有权限查看。" actionHref="/applications" action="回到我的申请" /> : null}
    {application && status ? <section className="mt-3 space-y-4 sm:mt-5">
      <div className="rounded-psw-xl bg-surface p-5 sm:p-8">
        <span className={cn("inline-flex rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", application.status === "ACCEPTED" ? "bg-success-soft text-success-text" : application.status === "SUBMITTED" ? "bg-warning-soft text-warning-text" : "bg-tag-neutral text-ink-secondary")}>{status.label}</span>
        <h1 className="mt-3 font-rounded text-m-title text-ink sm:text-d-title">{application.listingTitle ?? "房源申请"}</h1>
        <p className="mt-1 text-m-subhead text-ink-secondary sm:text-d-subhead">{formatRangeLong(application.moveIn.slice(0, 10), application.moveOut.slice(0, 10))} · <Link href={listingHref(application.listingId)} className="font-semibold text-primary-text underline underline-offset-4">查看房源</Link></p>
        <p className="mt-4 text-d-subhead text-ink">{status.description}</p>
        {stayTotal ? <div className="mt-5 rounded-psw-lg bg-surface-subtle p-4"><p className="flex flex-wrap items-baseline gap-x-1.5"><span className="text-m-footnote text-ink-secondary">房租总价</span><span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{formatUsd(stayTotal.total)}</span><span className="text-m-footnote text-ink-secondary">· {formatStayLength(stayTotal)}</span></p><p className="text-m-footnote text-ink-secondary">月租 {formatUsd(stayTotal.monthly)} · 零头按当月天数折算{hasPayment ? "" : " · 转租人接受后才付款"}</p></div> : null}
        <div className="mt-6 flex flex-wrap gap-3">
          {application.status === "DRAFT" && ownApplication ? <button type="button" onClick={() => void continueDraft()} className="primary-action">继续提交</button> : null}
          <Link href={`/inbox?listingId=${encodeURIComponent(application.listingId)}`} className="secondary-action"><MessageCircle className="size-4" aria-hidden="true" />打开相关消息</Link>
          {(application.status === "SUBMITTED" || application.status === "DRAFT") && ownApplication ? <button type="button" onClick={() => void withdraw()} className="inline-flex min-h-11 items-center rounded-full px-4 font-rounded text-sm font-bold text-danger-text hover:bg-danger-soft">撤回申请</button> : null}
        </div>
        {token && currentUserId ? <ApplicationCancellation application={application} token={token} currentUserId={currentUserId} onApplicationChange={(updated) => setApplication((current) => current ? mergeRentalApplicationUpdate(current, updated) : updated)} /> : null}
      </div>
      {token && currentUserId && hasPayment ? <PaymentPanel application={application} token={token} currentUserId={currentUserId} onApplicationChange={(updated) => setApplication((current) => current ? mergeRentalApplicationUpdate(current, updated) : updated)} /> : null}
      <div className="rounded-psw-xl bg-surface p-5 sm:p-8">
        <h2 className="text-m-headline sm:text-d-headline">申请资料</h2>
        <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {application.contactName ? <DetailItem label="联系人" value={application.contactName} /> : null}
          {application.contactEmail ? <DetailItem label="联系邮箱" value={application.contactEmail} /> : null}
          <DetailItem label="学校或职业" value={application.schoolOrOccupation} />
          <DetailItem label="收入区间" value={incomeBandLabel(application.incomeBand)} />
          <DetailItem label="担保人" value={guarantorLabel(application.guarantorStatus)} />
          <DetailItem label="申请方式" value={application.scope === "TEAM" ? "小组申请" : "个人申请"} />
        </dl>
        {application.note ? <p className="mt-5 whitespace-pre-wrap rounded-psw-lg bg-surface-subtle p-4 text-d-subhead text-ink-secondary">{application.note}</p> : null}
      </div>
    </section> : null}
    {confirmDialog}
  </div></main>;
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
  return <section className="rounded-psw-xl border border-dashed border-outline bg-surface px-6 py-12 text-center"><h2 className="font-rounded text-m-title sm:text-d-title font-bold">{title}</h2><p className="mt-2 text-sm text-ink-secondary">{detail}</p><Link href={actionHref} className="mt-5 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-white">{action}</Link></section>;
}

function StepHeading({ id, number, title, detail }: { id: string; number: string; title: string; detail: string }) {
  return <div><span className="text-m-footnote font-bold text-primary-text">{number} / 04</span><h2 id={id} className="mt-2 font-rounded text-m-title sm:text-d-title font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-secondary">{detail}</p></div>;
}

function Field({ label, className, error, children }: { label: string; className?: string; error?: string; children: ReactNode }) {
  // content-start: beside a field showing an error, the grid row grows; the label and box stay at the top.
  return <label className={cn("grid content-start gap-2 text-d-label text-ink-secondary", className)}>{label}{children}{error ? <span id="application-field-error" role="alert" className="text-m-footnote font-semibold text-danger-text">{error}</span> : null}</label>;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-m-footnote text-ink-secondary">{label}</dt><dd className="mt-0.5 text-d-label text-ink [overflow-wrap:anywhere]">{value}</dd></div>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-6 sm:py-4"><span className="font-semibold text-ink-secondary">{label}</span><span className="min-w-0 whitespace-pre-wrap text-right font-bold text-ink [overflow-wrap:anywhere]">{value}</span></div>;
}

/** After submitting: the page starts at its heading, wherever the long form was scrolled to. */
function SubmittedApplication({ listing }: { listing: PreviewListing }) {
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    confirmation.current?.focus({ preventScroll: true });
  }, []);
  return <main className="min-h-[calc(100dvh-72px)] bg-background"><div ref={confirmation} tabIndex={-1} className="page-container max-w-[640px] pb-16 pt-8 outline-none sm:pt-14">
    <EmptyState mood="happy" title="申请已提交" headingLevel={1} body={<>转租人会在消息里联系你，状态变化会出现在「我的申请」。提交申请不付款，转租人接受后再付。</>} action={<div className="flex flex-wrap justify-center gap-3"><Link href="/applications" className="primary-action">查看我的申请</Link><Link href={`/inbox?listingId=${encodeURIComponent(listing.id)}`} className="secondary-action">打开消息</Link></div>} />
  </div></main>;
}
