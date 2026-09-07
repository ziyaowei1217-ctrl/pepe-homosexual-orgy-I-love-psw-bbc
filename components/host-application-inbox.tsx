"use client";

import { useCallback, useEffect, useState } from "react";

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
  confirmDecision = (message) => typeof window !== "undefined" && window.confirm(message),
  requestReason = (message) => typeof window !== "undefined" ? window.prompt(message) : null
}: {
  token: string;
  currentUserId: string;
  confirmDecision?: (message: string) => boolean;
  requestReason?: (message: string) => string | null;
}) {
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
    if (!confirmDecision(decision === "accept" ? "确认接受这份申请？" : "确认拒绝这份申请？")) return;
    const reason = decision === "reject"
      ? (typeof window !== "undefined" ? window.prompt("请输入拒绝原因") : null)
      : null;
    if (decision === "reject" && !reason?.trim()) return;
    setPendingId(application.id);
    setError(null);
    try {
      if (decision === "accept") {
        await acceptRentalApplication(token, application.id, newIdempotencyKey("host-accept"));
      } else {
        await rejectRentalApplication(token, application.id, reason!.trim(), newIdempotencyKey("host-reject"));
      }
      await load();
    } catch (caught) {
      setError(toProductApiError(caught).message);
    } finally {
      setPendingId(null);
    }
  }

  async function cancel(application: ApiRentalApplication) {
    if (!confirmDecision("确认取消已接受的申请？持有资金会按服务端状态退款。")) return;
    const reason = requestReason("请输入取消原因");
    if (!reason?.trim()) return;
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
    <section className="space-y-4" aria-label="房东申请箱">
      <Card className="shadow-panel">
        <CardHeader><CardTitle>房东申请箱</CardTitle><CardDescription>仅显示当前账户所拥有房源的服务端申请</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          {applications.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂时没有租房申请。</p> : applications.map((application) => {
            const copy = getRentalApplicationStatusCopy(application.status);
            return (
              <article key={application.id} className="space-y-3 rounded-md border bg-white p-4">
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-extrabold">{application.listingTitle ?? "房源"}</h3><p className="text-sm text-muted-foreground">{application.memberSnapshots.map((member) => member.displayName).join("、")} · {application.moveIn.slice(0, 10)} 至 {application.moveOut.slice(0, 10)}</p></div><Badge variant={application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? "success" : "trust"}>{copy.label}</Badge></div>
                <p className="text-sm font-semibold">{application.schoolOrOccupation}</p>
                {application.note ? <p className="rounded-md bg-secondary p-3 text-sm">{application.note}</p> : null}
                {application.status === "SUBMITTED" ? <div className="flex gap-2"><Button variant="accept" disabled={pendingId === application.id} onClick={() => void decide(application, "accept")}>接受申请</Button><Button variant="outline" disabled={pendingId === application.id} onClick={() => void decide(application, "reject")}>拒绝申请</Button></div> : null}
                {application.status === "ACCEPTED" ? <Button variant="outline" disabled={pendingId === application.id} onClick={() => void cancel(application)}>取消申请</Button> : null}
                {application.status === "ACCEPTED" || application.status === "COMPLETED" || application.status === "CANCELLATION_PENDING" ? <PaymentPanel application={application} token={token} currentUserId={currentUserId} /> : null}
              </article>
            );
          })}
          {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}
