"use client";

import { useCallback, useEffect, useState } from "react";

import { PaymentPanel } from "@/components/payment-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toProductApiError } from "@/lib/product-errors";
import { useWindowFocusRefresh } from "@/lib/use-window-focus-refresh";
import {
  cancelRentalApplication,
  getMyRentalApplications,
  getRentalApplicationStatusCopy,
  newIdempotencyKey,
  withdrawRentalApplication,
  submitRentalApplication,
  type ApiRentalApplication
} from "@/lib/rental-applications";

export function ApplicationStatusPanel({
  token,
  currentUserId,
  confirmAction = (message) => typeof window !== "undefined" && window.confirm(message)
}: {
  token: string;
  currentUserId: string;
  confirmAction?: (message: string) => boolean;
}) {
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setApplications(await getMyRentalApplications(token));
    } catch (caught) {
      setError(toProductApiError(caught).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);
  useWindowFocusRefresh(load);

  async function withdraw(application: ApiRentalApplication) {
    if (!confirmAction("确认撤回这份申请？")) return;
    await mutate(application.id, () => withdrawRentalApplication(token, application.id, newIdempotencyKey("applicant-withdraw")));
  }

  async function cancel(application: ApiRentalApplication) {
    if (!confirmAction("确认取消已接受的申请？持有资金会按服务端状态退款。")) return;
    const reason = typeof window !== "undefined" ? window.prompt("请输入取消原因") : null;
    if (!reason?.trim()) return;
    await mutate(application.id, () => cancelRentalApplication(token, application.id, reason.trim(), newIdempotencyKey("applicant-cancel")));
  }

  async function mutate(id: string, command: () => Promise<unknown>) {
    setPendingId(id);
    setError(null);
    try {
      await command();
      await load();
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card className="shadow-panel">
      <CardHeader><CardTitle>租房申请行程</CardTitle><CardDescription>所有状态来自服务端，刷新后可继续</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        {applications.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">还没有租房申请。请从房源详情发起。</p> : applications.map((application) => {
          const copy = getRentalApplicationStatusCopy(application.status);
          return (
            <article key={application.id} className="space-y-3 rounded-md border bg-white p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{application.listingTitle ?? "房源"}</h3><p className="text-sm text-muted-foreground">{application.moveIn.slice(0, 10)} 至 {application.moveOut.slice(0, 10)} · {application.scope === "TEAM" ? "小组" : "个人"}</p></div><Badge variant={application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? "success" : "trust"}>{copy.label}</Badge></div>
              <p className="text-sm font-semibold text-muted-foreground">{copy.description}</p>
              {application.decisionReason ? <p className="rounded-md bg-secondary p-3 text-sm">{application.decisionReason}</p> : null}
              {application.status === "DRAFT" && application.submitterId === currentUserId ? <Button disabled={pendingId === application.id} onClick={() => void mutate(application.id, () => submitRentalApplication(token, application.id, `application-submit-${application.id}`))}>继续提交</Button> : null}
              {(application.status === "SUBMITTED" || application.status === "DRAFT") && application.submitterId === currentUserId ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void withdraw(application)}>撤回申请</Button> : null}
              {application.status === "ACCEPTED" ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void cancel(application)}>取消申请</Button> : null}
              {application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? <PaymentPanel application={application} token={token} currentUserId={currentUserId} /> : null}
            </article>
          );
        })}
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
