"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMO_PAYMENT_DISCLAIMER,
  canConfirmDemoMoveIn,
  demoLedgerAccountLabel,
  confirmDemoMoveIn,
  demoPaymentStatusLabel,
  getDemoPaymentState,
  simulateDemoPayment,
  type ApiDemoPaymentState
} from "@/lib/demo-payments";
import { toProductApiError } from "@/lib/product-errors";
import { newIdempotencyKey, type ApiRentalApplication } from "@/lib/rental-applications";
import { useWindowFocusRefresh } from "@/lib/use-window-focus-refresh";

export function DemoPaymentPanel({
  application,
  token,
  currentUserId,
  onApplicationChange
}: {
  application: ApiRentalApplication;
  token: string;
  currentUserId: string;
  onApplicationChange?: (application: ApiRentalApplication) => void;
}) {
  const [state, setState] = useState<ApiDemoPaymentState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadVersion = useRef(0);
  const commandKeys = useRef<Partial<Record<"success" | "failure" | "confirm", string>>>({});

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setError(null);
    try {
      const next = await getDemoPaymentState(token, application.id);
      if (version === loadVersion.current) setState(next);
    } catch (caught) {
      if (version === loadVersion.current) setError(toProductApiError(caught).message);
    }
  }, [application.id, token]);

  useEffect(() => {
    setState(null);
    void load();
    return () => { loadVersion.current += 1; };
  }, [load, application.status]);
  useWindowFocusRefresh(load);

  async function run(command: "success" | "failure" | "confirm") {
    if (pending || application.status !== "ACCEPTED") return;
    const key = commandKeys.current[command] ?? newIdempotencyKey(`demo-${command}`);
    commandKeys.current[command] = key;
    setPending(true);
    setError(null);
    try {
      assertCurrentAuthSession(token);
      const next = command === "confirm"
        ? await confirmDemoMoveIn(token, state!.heldFund!.id, key)
        : await simulateDemoPayment(token, application.id, command, key);
      assertCurrentAuthSession(token);
      setState(next);
      onApplicationChange?.(next.application);
      delete commandKeys.current[command];
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPending(false);
    }
  }

  const payment = state?.payment;
  const heldFund = state?.heldFund;
  const isRenter = currentUserId === application.submitterId;
  const isOwner = currentUserId === application.listingOwnerId;
  const needsConfirmation = application.status === "ACCEPTED" && heldFund?.status === "HELD" && ((isRenter && !heldFund.renterConfirmedAt) || (isOwner && !heldFund.ownerConfirmedAt));
  const moveInEligible = canConfirmDemoMoveIn(application.moveIn);
  const canConfirm = needsConfirmation && moveInEligible;

  return (
    <Card className="border-blue-200 bg-blue-50/30 shadow-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><CardTitle>演示支付与资金状态</CardTitle><CardDescription>{DEMO_PAYMENT_DISCLAIMER}</CardDescription></div>
          {payment ? <Badge variant={payment.status === "RELEASED" ? "success" : "trust"}>{demoPaymentStatusLabel(payment.status)}</Badge> : <Badge variant="secondary">读取中</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-md bg-white p-3 text-sm font-extrabold text-primary">{DEMO_PAYMENT_DISCLAIMER}</p>
        {payment ? (
          <div className="grid gap-3">
            <div className="flex justify-between rounded-md border bg-white p-3 text-sm font-bold"><span>{application.scope === "TEAM" ? "两人小组申请" : "个人申请"}</span><span>${(payment.amountCents / 100).toLocaleString()} {payment.currency}</span></div>
            {payment.status === "AWAITING_ATTEMPT" && isRenter && application.status === "ACCEPTED" ? <div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => void run("success")}>模拟支付成功</Button><Button variant="outline" disabled={pending} onClick={() => void run("failure")}>模拟支付失败</Button></div> : null}
            {state?.attempts.at(-1)?.outcome === "FAILED" ? <p className="text-sm font-semibold text-destructive">上次模拟失败，可重试；未发生真实扣款。</p> : null}
            {heldFund ? (
              <div className="grid gap-2 rounded-md border bg-white p-3 text-sm font-semibold">
                <div className="flex justify-between"><span>租客确认入住</span><span>{heldFund.renterConfirmedAt ? "已确认" : "待确认"}</span></div>
                <div className="flex justify-between"><span>房东确认入住</span><span>{heldFund.ownerConfirmedAt ? "已确认" : "待确认"}</span></div>
                <div className="flex justify-between"><span>资金状态</span><span>{demoPaymentStatusLabel(payment.status)}</span></div>
              </div>
            ) : null}
            {state?.ledgerEntries.length ? (
              <section className="grid gap-2 rounded-md border bg-white p-3" aria-label="不可变资金流水">
                <div>
                  <h4 className="text-sm font-extrabold text-primary">不可变资金流水</h4>
                  <p className="text-xs font-semibold text-muted-foreground">每笔事件按借贷成对记录，历史记录不可修改。</p>
                </div>
                <ul className="grid gap-2">
                  {state.ledgerEntries.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs font-semibold">
                      <span>{entry.event} · {demoLedgerAccountLabel(entry.account)} · {entry.direction === "DEBIT" ? "借记" : "贷记"}</span>
                      <span>${(entry.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {needsConfirmation ? (
              <div className="grid gap-2">
                <Button variant="accept" disabled={pending || !canConfirm} onClick={() => void run("confirm")}>确认已入住</Button>
                {!moveInEligible ? <p className="text-xs font-semibold text-muted-foreground">{application.moveIn.slice(0, 10)} 起可确认入住。</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {pending ? <p className="text-xs text-muted-foreground">正在同步服务端状态…</p> : null}
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
