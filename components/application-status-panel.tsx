"use client";

import { useCallback, useEffect, useState } from "react";

import { useConfirm, type ConfirmOptions } from "@/components/marketplace/confirm-dialog";
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
  confirmAction
}: {
  token: string;
  currentUserId: string;
  /** Defaults to the site's confirmation dialog; resolves to false when dismissed, otherwise the reason it asked for. */
  confirmAction?: (options: ConfirmOptions) => Promise<string | false>;
}) {
  const [dialog, siteConfirm] = useConfirm();
  const confirm = confirmAction ?? siteConfirm;
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
    if (await confirm({ title: "撤回这份申请？", body: "撤回后这份申请就结束了。想再租这个房间，需要重新申请。", confirmLabel: "撤回申请", tone: "danger" }) === false) return;
    await mutate(application.id, () => withdrawRentalApplication(token, application.id, newIdempotencyKey("applicant-withdraw")));
  }

  async function cancel(application: ApiRentalApplication) {
    const reason = await confirm({ title: "取消已接受的申请？", body: "如果已经付款，会按付款状态退款。请写一句原因，对方会看到。", confirmLabel: "取消申请", cancelLabel: "先不", tone: "danger", reason: { label: "取消的原因", placeholder: "例如：学校宿舍批下来了" } });
    if (reason === false || !reason.trim()) return;
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
            <article key={application.id} className="space-y-3 rounded-md border bg-surface p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{application.listingTitle ?? "房源"}</h3><p className="text-sm text-muted-foreground">{application.moveIn.slice(0, 10)} 至 {application.moveOut.slice(0, 10)} · {application.scope === "TEAM" ? "小组" : "个人"}</p></div><Badge variant={application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? "success" : "trust"}>{copy.label}</Badge></div>
              <p className="text-sm font-semibold text-muted-foreground">{copy.description}</p>
              {application.decisionReason ? <p className="rounded-md bg-secondary p-3 text-sm">{application.decisionReason}</p> : null}
              {application.status === "DRAFT" && application.submitterId === currentUserId ? <Button disabled={pendingId === application.id} onClick={() => void mutate(application.id, () => submitRentalApplication(token, application.id, `application-submit-${application.id}`))}>继续提交</Button> : null}
              {(application.status === "SUBMITTED" || application.status === "DRAFT") && application.submitterId === currentUserId ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void withdraw(application)}>撤回申请</Button> : null}
              {application.status === "ACCEPTED" ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void cancel(application)}>取消申请</Button> : null}
              {application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? <PaymentPanel inset application={application} token={token} currentUserId={currentUserId} /> : null}
            </article>
          );
        })}
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </CardContent>
      {dialog}
    </Card>
  );
}
