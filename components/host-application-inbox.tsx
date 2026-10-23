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
  acceptRentalApplication,
  cancelRentalApplication,
  getHostRentalApplications,
  getRentalApplicationStatusCopy,
  newIdempotencyKey,
  rejectRentalApplication,
  type ApiRentalApplication
} from "@/lib/rental-applications";

export function HostApplicationInbox({
  token,
  currentUserId,
  confirmDecision
}: {
  token: string;
  currentUserId: string;
  /** Defaults to the site's confirmation dialog; resolves to false when dismissed, otherwise the reason it asked for. */
  confirmDecision?: (options: ConfirmOptions) => Promise<string | false>;
}) {
  const [dialog, siteConfirm] = useConfirm();
  const confirm = confirmDecision ?? siteConfirm;
  const [applications, setApplications] = useState<ApiRentalApplication[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setApplications(await getHostRentalApplications(token));
    } catch (caught) {
      setError(toProductApiError(caught).message);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);
  useWindowFocusRefresh(load);

  async function decide(application: ApiRentalApplication, decision: "accept" | "reject") {
    const who = application.contactName ?? application.memberSnapshots?.[0]?.displayName ?? "申请人";
    const answer = await confirm(decision === "accept"
      ? { title: `接受${who}的申请？`, body: "接受后，这份申请进入签约和付款。", confirmLabel: "接受申请" }
      : { title: `不通过${who}的申请？`, body: "请写一句原因，对方会看到。", confirmLabel: "不通过", tone: "danger", reason: { label: "不通过的原因", placeholder: "例如：入住日期和可租期对不上" } });
    if (answer === false || (decision === "reject" && !answer.trim())) return;
    const reason = answer;
    setPendingId(application.id);
    setError(null);
    try {
      if (decision === "accept") {
        await acceptRentalApplication(token, application.id, newIdempotencyKey("host-accept"));
      } else {
        await rejectRentalApplication(token, application.id, reason.trim(), newIdempotencyKey("host-reject"));
      }
      await load();
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPendingId(null);
    }
  }

  async function cancel(application: ApiRentalApplication) {
    const reason = await confirm({ title: "取消已接受的申请？", body: "如果已经付款，会按付款状态退款。请写一句原因，对方会看到。", confirmLabel: "取消申请", cancelLabel: "先不", tone: "danger", reason: { label: "取消的原因", placeholder: "例如：学校宿舍批下来了" } });
    if (reason === false || !reason.trim()) return;
    setPendingId(application.id);
    setError(null);
    try {
      await cancelRentalApplication(
        token,
        application.id,
        reason.trim(),
        newIdempotencyKey("host-cancel")
      );
      await load();
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-4" aria-label="收到的申请">
      <Card className="shadow-panel">
        <CardHeader><CardTitle>收到的申请</CardTitle><CardDescription>仅显示当前账户所拥有房源的服务端申请</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {applications.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂时没有租房申请。</p> : applications.map((application) => {
            const copy = getRentalApplicationStatusCopy(application.status);
            return (
              <article key={application.id} className="space-y-3 rounded-md border bg-surface p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{application.listingTitle ?? "房源"}</h3><p className="text-sm text-muted-foreground">{application.memberSnapshots.map((member) => member.displayName).join("、")} · {application.moveIn.slice(0, 10)} 至 {application.moveOut.slice(0, 10)}</p></div><Badge variant={application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? "success" : "trust"}>{copy.label}</Badge></div>
                <p className="text-sm font-semibold">{application.schoolOrOccupation}</p>
                {application.note ? <p className="rounded-md bg-secondary p-3 text-sm">{application.note}</p> : null}
                {application.status === "SUBMITTED" ? <div className="flex gap-2"><Button variant="accept" disabled={pendingId === application.id} onClick={() => void decide(application, "accept")}>接受申请</Button><Button variant="outline" disabled={pendingId === application.id} onClick={() => void decide(application, "reject")}>不通过</Button></div> : null}
                {application.status === "ACCEPTED" ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void cancel(application)}>取消申请</Button> : null}
                {application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? <PaymentPanel inset application={application} token={token} currentUserId={currentUserId} /> : null}
              </article>
            );
          })}
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
      {dialog}
    </section>
  );
}
