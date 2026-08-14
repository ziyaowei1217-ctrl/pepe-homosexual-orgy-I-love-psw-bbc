"use client";

import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMO_PAYMENT_DISCLAIMER,
  confirmDemoMoveIn,
  demoPaymentStatusLabel,
  getDemoPaymentState,
  simulateDemoPayment,
  type ApiDemoPaymentState
} from "@/lib/demo-payments";
import { toProductApiError } from "@/lib/product-errors";
import { newIdempotencyKey, type ApiRentalApplication } from "@/lib/rental-applications";

export function DemoPaymentPanel({
  application,
  token,
  currentUserId
}: {
  application: ApiRentalApplication;
  token: string;
  currentUserId: string;
}) {
  const [state, setState] = useState<ApiDemoPaymentState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    void getDemoPaymentState(token, application.id)
      .then((next) => { if (active) setState(next); })
      .catch((caught) => { if (active) setError(toProductApiError(caught).message); });
    return () => { active = false; };
  }, [application.id, token]);

  async function run(command: "success" | "failure" | "confirm") {
    if (pending) return;
    const key = commandKey.current ?? newIdempotencyKey(`demo-${command}`);
    commandKey.current = key;
    setPending(true);
    setError(null);
    try {
      const next = command === "confirm"
        ? await confirmDemoMoveIn(token, state!.heldFund!.id, key)
        : await simulateDemoPayment(token, application.id, command, key);
      setState(next);
      commandKey.current = null;
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
  const canConfirm = heldFund?.status === "HELD" && ((isRenter && !heldFund.renterConfirmedAt) || (isOwner && !heldFund.ownerConfirmedAt));

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
            {payment.status === "AWAITING_ATTEMPT" && isRenter ? <div className="flex flex-wrap gap-2"><Button disabled={pending} onClick={() => void run("success")}>模拟支付成功</Button><Button variant="outline" disabled={pending} onClick={() => void run("failure")}>模拟支付失败</Button></div> : null}
            {state?.attempts.at(-1)?.outcome === "FAILED" ? <p className="text-sm font-semibold text-destructive">上次模拟失败，可重试；未发生真实扣款。</p> : null}
            {heldFund ? (
              <div className="grid gap-2 rounded-md border bg-white p-3 text-sm font-semibold">
                <div className="flex justify-between"><span>租客确认入住</span><span>{heldFund.renterConfirmedAt ? "已确认" : "待确认"}</span></div>
                <div className="flex justify-between"><span>房东确认入住</span><span>{heldFund.ownerConfirmedAt ? "已确认" : "待确认"}</span></div>
                <div className="flex justify-between"><span>资金状态</span><span>{demoPaymentStatusLabel(payment.status)}</span></div>
              </div>
            ) : null}
            {canConfirm ? <Button variant="accept" disabled={pending} onClick={() => void run("confirm")}>确认已入住</Button> : null}
          </div>
        ) : null}
        {pending ? <p className="text-xs text-muted-foreground">正在同步服务端状态…</p> : null}
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
