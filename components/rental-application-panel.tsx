"use client";

import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toProductApiError } from "@/lib/product-errors";
import type { ApiRoommateTeam } from "@/lib/roommate-teams";
import {
  applicationScopeOptions,
  createAndSubmitRentalApplication,
  newIdempotencyKey,
  validateRentalApplicationDraft,
  type ApiRentalApplication,
  type RentalApplicationDraft,
  type RentalApplicationScope
} from "@/lib/rental-applications";

export function RentalApplicationPanel({
  listing,
  token,
  team,
  profile,
  onClose,
  onSubmitted
}: {
  listing: { id: string; title: string; price: number; availableFrom?: string; availableTo?: string };
  token: string;
  team: ApiRoommateTeam | null;
  profile?: { displayName?: string | null; school?: string | null } | null;
  onClose(): void;
  onSubmitted(application: ApiRentalApplication): void;
}) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<RentalApplicationDraft>({
    scope: "SOLO",
    teamId: undefined,
    moveIn: listing.availableFrom?.slice(0, 10) ?? "",
    moveOut: listing.availableTo?.slice(0, 10) ?? "",
    schoolOrOccupation: profile?.school ?? "",
    incomeBand: "TWO_TO_THREE_X",
    guarantorStatus: "AVAILABLE",
    note: ""
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const keys = useRef({ create: newIdempotencyKey("application-create"), submit: newIdempotencyKey("application-submit") });
  const scopes = applicationScopeOptions(team);

  function chooseScope(scope: RentalApplicationScope) {
    setDraft((current) => ({ ...current, scope, teamId: scope === "TEAM" ? team?.id : undefined }));
  }

  function continueToReview() {
    const errors = validateRentalApplicationDraft(draft, listing);
    if (errors.length > 0) {
      setError(errors[0]!);
      return;
    }
    setError(null);
    setStep(2);
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const application = await createAndSubmitRentalApplication(token, listing.id, draft, keys.current);
      onSubmitted(application);
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label="租房申请">
      <Card className="max-h-[92vh] w-full max-w-2xl overflow-y-auto shadow-panel">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge variant="trust">{step + 1} / 3</Badge>
              <CardTitle className="mt-2">申请 {listing.title}</CardTitle>
              <CardDescription>${listing.price.toLocaleString()}/月 · 不收集证件、银行流水或精确收入</CardDescription>
            </div>
            <Button variant="ghost" onClick={onClose} disabled={pending}>关闭</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 ? (
            <section className="space-y-3" aria-label="申请方式">
              <h2 className="text-lg font-extrabold">申请方式</h2>
              {scopes.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`w-full rounded-md border p-4 text-left font-bold ${draft.scope === option.value ? "border-blue-500 bg-blue-50" : "bg-white"}`}
                  onClick={() => chooseScope(option.value)}
                >
                  {option.label}
                </button>
              ))}
              <Button className="w-full" onClick={() => setStep(1)}>下一步</Button>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="grid gap-4 md:grid-cols-2" aria-label="日期与资料">
              <label className="grid gap-2 text-sm font-bold">入住日期<Input type="date" value={draft.moveIn} onChange={(event) => setDraft({ ...draft, moveIn: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold">退租日期<Input type="date" value={draft.moveOut} onChange={(event) => setDraft({ ...draft, moveOut: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold md:col-span-2">学校或职业<Input value={draft.schoolOrOccupation} maxLength={140} onChange={(event) => setDraft({ ...draft, schoolOrOccupation: event.target.value })} /></label>
              <label className="grid gap-2 text-sm font-bold">收入区间
                <select className="h-10 rounded-md border bg-white px-3" value={draft.incomeBand} onChange={(event) => setDraft({ ...draft, incomeBand: event.target.value as RentalApplicationDraft["incomeBand"] })}>
                  <option value="BELOW_2X">低于月租 2 倍</option><option value="TWO_TO_THREE_X">月租 2–3 倍</option><option value="THREE_TO_FOUR_X">月租 3–4 倍</option><option value="ABOVE_FOUR_X">高于月租 4 倍</option><option value="PREFER_NOT_TO_SAY">不愿透露</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold">担保人
                <select className="h-10 rounded-md border bg-white px-3" value={draft.guarantorStatus} onChange={(event) => setDraft({ ...draft, guarantorStatus: event.target.value as RentalApplicationDraft["guarantorStatus"] })}>
                  <option value="AVAILABLE">可提供</option><option value="NOT_AVAILABLE">无法提供</option><option value="NOT_NEEDED">不需要</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-bold md:col-span-2">补充说明
                <textarea className="min-h-24 rounded-md border p-3" maxLength={1000} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
              </label>
              <div className="flex gap-2 md:col-span-2"><Button variant="outline" onClick={() => setStep(0)}>上一步</Button><Button className="flex-1" onClick={continueToReview}>确认资料</Button></div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4" aria-label="确认提交">
              <h2 className="text-lg font-extrabold">确认提交</h2>
              <div className="grid gap-2 rounded-md bg-secondary p-4 text-sm font-semibold">
                <span>{draft.scope === "TEAM" ? "两人小组申请" : "个人申请"}</span>
                <span>{draft.moveIn} 至 {draft.moveOut}</span>
                <span>{draft.schoolOrOccupation}</span>
              </div>
              <p className="text-sm text-muted-foreground">提交后会进入房东申请箱；页面刷新后仍以服务端状态为准。</p>
              <div className="flex gap-2"><Button variant="outline" disabled={pending} onClick={() => setStep(1)}>上一步</Button><Button className="flex-1" disabled={pending} onClick={() => void submit()}>{pending ? "提交中…" : "提交申请"}</Button></div>
            </section>
          ) : null}
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
