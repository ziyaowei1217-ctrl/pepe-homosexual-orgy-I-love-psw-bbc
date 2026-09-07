"use client";

import { useEffect, useId, useRef, useState } from "react";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { localDate } from "@/lib/listing-stay";
import { cancelRentalApplication, newIdempotencyKey, type ApiRentalApplication } from "@/lib/rental-applications";

type Props = {
  application: ApiRentalApplication;
  token: string;
  currentUserId: string;
  onApplicationChange: (application: ApiRentalApplication) => void;
};
type CancellationRequest = { key: string; reason: string };

export function ApplicationCancellation(props: Props) {
  return <CancellationSession key={`${props.token}:${props.application.id}`} {...props} />;
}

function CancellationSession({ application, token, currentUserId, onApplicationChange }: Props) {
  const storageKey = `sublet_cancellation:${encodeURIComponent(currentUserId)}:${encodeURIComponent(application.id)}:${encodeURIComponent(application.decidedAt ?? "accepted")}`;
  const [request, setRequest] = useState<CancellationRequest | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      return typeof saved?.key === "string" && saved.key && typeof saved?.reason === "string" && saved.reason.trim() ? saved : null;
    } catch { return null; }
  });
  const [reason, setReason] = useState(request?.reason ?? "");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const active = useRef(true);
  const reasonId = useId();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  useEffect(() => {
    if (["CANCELLED", "COMPLETED", "WITHDRAWN", "REJECTED", "DRAFT"].includes(application.status)) localStorage.removeItem(storageKey);
  }, [application.status, storageKey]);

  const canCancel = application.status === "ACCEPTED" && localDate() < application.moveIn.slice(0, 10) &&
    (currentUserId === application.submitterId || currentUserId === application.listingOwnerId);
  if (!canCancel) return null;

  async function cancel() {
    if (busy.current || !reason.trim()) return;
    busy.current = true;
    setPending(true); setError(null);
    try {
      assertCurrentAuthSession(token);
      // Preserve the exact command through uncertain network/provider outcomes and reloads.
      const command = request ?? { key: newIdempotencyKey("application-cancel"), reason: reason.trim() };
      localStorage.setItem(storageKey, JSON.stringify(command));
      setRequest(command);
      const updated = await cancelRentalApplication(token, application.id, command.reason, command.key);
      assertCurrentAuthSession(token);
      if (!active.current) return;
      if (updated.status === "CANCELLED") localStorage.removeItem(storageKey);
      onApplicationChange(updated);
      setOpen(false);
    } catch (caught) {
      if (active.current) setError(caught instanceof Error ? caught.message : "取消结果暂时无法确认，请重试或刷新申请状态。");
    } finally {
      busy.current = false;
      if (active.current) setPending(false);
    }
  }

  return <div className="mt-5">
    {!open ? <button type="button" onClick={() => setOpen(true)} className="secondary-action text-red-600">取消申请</button> :
      <div className="space-y-3 rounded-2xl border border-red-100 bg-red-50/50 p-4">
        <p className="text-sm text-slate-700">确认取消这份已接受的申请。已付款的申请会进入退款处理，结果以最新状态为准。</p>
        <label htmlFor={reasonId} className="block text-sm font-bold">取消原因</label>
        <textarea id={reasonId} value={reason} maxLength={500} readOnly={Boolean(request)} disabled={pending} onChange={(event) => setReason(event.target.value)} className="application-input min-h-24 py-3" />
        {request ? <p className="text-xs text-slate-600">重试会继续处理上次的取消请求。</p> : null}
        <div className="flex gap-2"><button type="button" disabled={pending || !reason.trim()} onClick={() => void cancel()} className="primary-action">{pending ? "正在取消…" : "确认取消申请"}</button><button type="button" disabled={pending} onClick={() => setOpen(false)} className="secondary-action">暂不取消</button></div>
      </div>}
    {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
  </div>;
}
