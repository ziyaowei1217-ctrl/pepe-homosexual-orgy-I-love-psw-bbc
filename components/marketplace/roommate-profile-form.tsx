"use client";

import Link from "next/link";
import { cloneElement, useEffect, useId, useState, type ChangeEvent, type FormEvent, type ReactElement, type ReactNode } from "react";

import { EmptyState } from "@/components/marketplace/empty-state";
import { PageHeader } from "@/components/marketplace/page-header";
import { getMyProfile } from "@/lib/api";
import { authRoute } from "@/lib/app-routes";
import { assertCurrentAuthSession, readStoredAuthSession } from "@/lib/auth-session";
import { getMyRoommateProfile, roommateLabels, saveMyRoommateProfile, type MyRoommateProfile, type RoommateField, type RoommateProfileInput } from "@/lib/roommate-matching";
import { cn } from "@/lib/utils";
import { useAuthSessionToken } from "@/lib/use-auth-session-token";
import { DateInput } from "@/components/ui/date-input";

type ChoiceKey = "gender" | "genderPreference" | "roomType" | "sleepSchedule" | "cleanliness" | "guests" | "smoking" | "pets";
type TextKey = "displayName" | "age" | "moveInDate" | "moveOutDate" | "city" | "school" | "neighborhoods" | "budgetMin" | "budgetMax" | "intro" | "lookingFor";
type Draft = Record<TextKey, string> & Record<ChoiceKey, string | null> & { dealbreakers: string[] };
type Errors = Partial<Record<"age" | "dates" | "budget" | "neighborhoods", string>>;

// The API's limits (api/src/marketplace/dto.ts).
const maxNeighborhoods = 12;
const maxBudget = 100_000;
const errorText = "text-m-footnote text-danger-text sm:text-d-footnote";

export function RoommateProfileEditor() {
  const token = useAuthSessionToken();
  return <RoommateProfileSession key={token ?? "guest"} token={token} />;
}

function RoommateProfileSession({ token }: { token: string | null }) {
  const [loaded, setLoaded] = useState<{ profile: MyRoommateProfile | null; displayName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const isCurrent = () => !cancelled && readStoredAuthSession()?.accessToken === token;
    Promise.all([getMyRoommateProfile(token), getMyProfile(token)])
      .then(([profile, account]) => { if (isCurrent()) setLoaded({ profile, displayName: account.displayName ?? "" }); })
      .catch((caught) => { if (isCurrent()) setError(caught instanceof Error ? caught.message : "室友资料暂时无法加载。"); });
    return () => { cancelled = true; };
  }, [token, loadAttempt]);

  let content: ReactNode;
  if (!token) {
    content = <div className="mt-6 rounded-psw-xl bg-surface p-6"><p className="text-m-headline text-ink sm:text-d-headline">登录后填写室友资料</p><Link href={authRoute({ returnTo: "/roommates/me", intent: "roommate-action" })} className="primary-action mt-4">登录</Link></div>;
  } else if (error) {
    content = <EmptyState className="mt-6" mood="sorry" title="室友资料没加载出来" body={<span role="alert">{error}</span>} action={<button type="button" onClick={() => { setError(null); setLoadAttempt((attempt) => attempt + 1); }} className="primary-action">重试</button>} />;
  } else if (!loaded) {
    content = <p role="status" className="mt-6 rounded-psw-xl bg-surface p-10 text-center text-m-subhead text-ink-secondary sm:text-d-subhead">正在加载室友资料…</p>;
  } else {
    content = <RoommateProfileForm token={token} profile={loaded.profile} displayName={loaded.displayName} />;
  }

  return <main className="min-h-[calc(100dvh-72px)] bg-background">
    <div className="page-container pb-16 pt-8 sm:pt-12">
      <PageHeader title="室友资料" description="这些信息会显示在你的室友卡片上，并用于计算匹配度。室友性别偏好和「不能接受」只用于匹配，不公开。互相喜欢后才能聊天。" />
      {content}
    </div>
  </main>;
}

function RoommateProfileForm({ token, profile, displayName }: { token: string; profile: MyRoommateProfile | null; displayName: string }) {
  const [draft, setDraft] = useState(() => toDraft(profile, displayName));
  const [profileId, setProfileId] = useState(profile?.id ?? null);
  const [savedName, setSavedName] = useState(displayName.trim() || null);
  const [errors, setErrors] = useState<Errors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const budgetErrorId = useId();

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(draft);
    setErrors(nextErrors);
    setSaveError(null);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    try {
      assertCurrentAuthSession(token);
      const name = draft.displayName.trim() || null;
      const result = await saveMyRoommateProfile(token, profileId, toInput(draft), name === savedName ? undefined : name);
      assertCurrentAuthSession(token);
      setProfileId(result.id);
      setSavedName(name);
      setSaved(true);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "保存没有成功，请重试。");
    } finally {
      setSaving(false);
    }
  }

  const bind = (key: TextKey) => ({
    value: draft[key],
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update({ [key]: event.target.value } as Partial<Draft>)
  });
  const single = (key: ChoiceKey, required = false) => ({
    field: key,
    isActive: (code: string) => draft[key] === code,
    onToggle: (code: string) => update({ [key]: draft[key] === code && !required ? null : code } as Partial<Draft>)
  });

  return <form noValidate onSubmit={save} className="mt-6 grid max-w-3xl gap-5">
    <Section title="基本信息">
      <Field label="称呼"><input {...bind("displayName")} maxLength={140} autoComplete="nickname" className="application-input" /></Field>
      <Field label="年龄" error={errors.age}><input {...bind("age")} inputMode="numeric" className="application-input" /></Field>
      <Chips label="性别" {...single("gender")} />
      <Chips label="室友性别偏好" {...single("genderPreference", true)} />
    </Section>
    <Section title="入住">
      <Field label="入住日期"><DateInput aria-label="入住日期" {...bind("moveInDate")} className="application-input flex items-center peer-aria-[invalid=true]:border-danger" /></Field>
      <Field label="搬走日期" error={errors.dates}><DateInput aria-label="搬走日期" {...bind("moveOutDate")} min={draft.moveInDate || undefined} className="application-input flex items-center peer-aria-[invalid=true]:border-danger" /></Field>
      <Field label="城市"><input {...bind("city")} maxLength={140} placeholder="Los Angeles" className="application-input" /></Field>
      <Field label="学校或公司"><input {...bind("school")} maxLength={140} placeholder="UCLA" className="application-input" /></Field>
      <Field label="想住的区域" hint="多个区域用逗号或顿号分开" error={errors.neighborhoods} wide><input {...bind("neighborhoods")} placeholder="Westwood、Sawtelle" className="application-input" /></Field>
      <Chips label="房型" {...single("roomType")} />
    </Section>
    <Section title="预算">
      <Field label="每月最低（美元）" invalid={Boolean(errors.budget)} describedBy={budgetErrorId}><input {...bind("budgetMin")} inputMode="numeric" placeholder="1200" className="application-input" /></Field>
      <Field label="每月最高（美元）" invalid={Boolean(errors.budget)} describedBy={budgetErrorId}><input {...bind("budgetMax")} inputMode="numeric" placeholder="1600" className="application-input" /></Field>
      {errors.budget ? <p id={budgetErrorId} role="alert" className={`${errorText} sm:col-span-2`}>{errors.budget}</p> : null}
    </Section>
    <Section title="生活习惯">
      <Chips label="作息" {...single("sleepSchedule")} />
      <Chips label="整洁" {...single("cleanliness")} />
      <Chips label="带朋友" {...single("guests")} />
      <Chips label="吸烟" {...single("smoking")} />
      <Chips label="宠物" {...single("pets")} />
    </Section>
    <Section title="不能接受">
      <Chips label="对方有这些情况时，不会互相推荐" field="dealbreakers" isActive={(code) => draft.dealbreakers.includes(code)}
        onToggle={(code) => update({ dealbreakers: draft.dealbreakers.includes(code) ? draft.dealbreakers.filter((item) => item !== code) : [...draft.dealbreakers, code] })} />
    </Section>
    <Section title="介绍">
      <Field label="自我介绍" wide><textarea {...bind("intro")} maxLength={1000} rows={4} className="application-input h-auto py-3" /></Field>
      <Field label="想找什么样的室友" wide><textarea {...bind("lookingFor")} maxLength={1000} rows={4} className="application-input h-auto py-3" /></Field>
    </Section>
    <div className="flex flex-wrap items-center gap-4">
      <button type="submit" disabled={saving} className="primary-action">{saving ? "保存中…" : "保存"}</button>
      {saved ? <p role="status" className="flex items-center gap-3 text-m-subhead text-ink sm:text-d-subhead">已保存<Link href="/roommates" className="tap-target font-semibold text-primary-text underline">去看推荐</Link></p> : null}
      {saveError ? <p role="alert" className="text-m-subhead text-danger-text sm:text-d-subhead">{saveError}</p> : null}
    </div>
  </form>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return <section aria-labelledby={titleId} className="rounded-psw-xl bg-surface p-5 sm:p-7">
    <h2 id={titleId} className="text-m-headline sm:text-d-headline">{title}</h2>
    <div className="mt-5 grid gap-5 sm:grid-cols-2">{children}</div>
  </section>;
}

/** A labelled input whose hint and error (its own, or a shared one named by describedBy) are read with it. */
function Field({ label, hint, error, invalid = Boolean(error), describedBy, wide = false, children }: {
  label: string; hint?: string; error?: string; invalid?: boolean; describedBy?: string; wide?: boolean; children: ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>;
}) {
  const id = useId();
  const described = [hint && `${id}-hint`, error && `${id}-error`, invalid && describedBy].filter(Boolean).join(" ");
  return <div className={`grid content-start gap-2 ${wide ? "sm:col-span-2" : ""}`}>
    <label className="grid gap-2 text-m-label text-ink sm:text-d-label">{label}{cloneElement(children, { "aria-invalid": invalid, "aria-describedby": described || undefined })}</label>
    {hint ? <p id={`${id}-hint`} className="text-m-footnote text-ink-secondary sm:text-d-footnote">{hint}</p> : null}
    {error ? <p id={`${id}-error`} role="alert" className={errorText}>{error}</p> : null}
  </div>;
}

function Chips({ label, field, isActive, onToggle }: { label: string; field: RoommateField; isActive: (code: string) => boolean; onToggle: (code: string) => void }) {
  const labelId = useId();
  return <div role="group" aria-labelledby={labelId} className="sm:col-span-2">
    <p id={labelId} className="text-m-label text-ink sm:text-d-label">{label}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {Object.entries(roommateLabels[field]).map(([code, text]) => <button key={code} type="button" aria-pressed={isActive(code)} onClick={() => onToggle(code)} className={cn("search-pill", isActive(code) && "search-pill-active")}>{text}</button>)}
    </div>
  </div>;
}

function toDraft(profile: MyRoommateProfile | null, displayName: string): Draft {
  const text = (value: string | number | null | undefined) => value == null ? "" : String(value);
  // The API returns only known codes for the choice fields.
  return {
    displayName,
    age: text(profile?.age),
    gender: profile?.gender ?? null,
    genderPreference: profile?.genderPreference ?? "any",
    moveInDate: text(profile?.moveInDate),
    moveOutDate: text(profile?.moveOutDate),
    city: text(profile?.city),
    school: text(profile?.school),
    neighborhoods: profile?.preferredNeighborhoods.join("、") ?? "",
    roomType: profile?.roomType ?? null,
    budgetMin: text(profile?.budgetMin),
    budgetMax: text(profile?.budgetMax),
    sleepSchedule: profile?.sleepSchedule ?? null,
    cleanliness: profile?.cleanliness ?? null,
    guests: profile?.guests ?? null,
    smoking: profile?.smoking ?? null,
    pets: profile?.pets ?? null,
    dealbreakers: profile?.dealbreakers ?? [],
    intro: text(profile?.intro),
    lookingFor: text(profile?.lookingFor)
  };
}

function parseBudget(value: string) {
  const digits = value.replace(/[$,\s]/g, "");
  if (!digits) return null;
  return /^\d+$/.test(digits) && Number(digits) <= maxBudget ? Number(digits) : NaN;
}

function splitAreas(value: string) {
  return [...new Set(value.split(/[,，、]/).map((area) => area.trim()).filter(Boolean))];
}

function validate(draft: Draft): Errors {
  const errors: Errors = {};
  const age = Number(draft.age.trim());
  if (!/^\d+$/.test(draft.age.trim()) || age < 18 || age > 80) errors.age = "年龄需要在 18 到 80 岁之间。";
  const min = parseBudget(draft.budgetMin);
  const max = parseBudget(draft.budgetMax);
  if (Number.isNaN(min) || Number.isNaN(max)) errors.budget = "预算请填写 0 到 100,000 之间的整数。";
  else if (min !== null && max !== null && min > max) errors.budget = "每月最低预算不能高于最高预算。";
  if (draft.moveInDate && draft.moveOutDate && draft.moveInDate > draft.moveOutDate) errors.dates = "搬走日期不能早于入住日期。";
  if (splitAreas(draft.neighborhoods).length > maxNeighborhoods) errors.neighborhoods = `想住的区域最多填 ${maxNeighborhoods} 个。`;
  return errors;
}

function toInput(draft: Draft): RoommateProfileInput {
  const text = (value: string) => value.trim() || null;
  return {
    age: Number(draft.age.trim()),
    gender: draft.gender,
    genderPreference: draft.genderPreference ?? "any",
    school: text(draft.school),
    city: text(draft.city),
    budgetMin: parseBudget(draft.budgetMin),
    budgetMax: parseBudget(draft.budgetMax),
    moveInDate: draft.moveInDate || null,
    moveOutDate: draft.moveOutDate || null,
    preferredNeighborhoods: splitAreas(draft.neighborhoods),
    roomType: draft.roomType,
    sleepSchedule: draft.sleepSchedule,
    cleanliness: draft.cleanliness,
    guests: draft.guests,
    smoking: draft.smoking,
    pets: draft.pets,
    dealbreakers: draft.dealbreakers,
    intro: text(draft.intro),
    lookingFor: text(draft.lookingFor)
  };
}
