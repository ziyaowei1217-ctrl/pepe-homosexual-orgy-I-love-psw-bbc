"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { DemoPaymentPanel } from "@/components/demo-payment-panel";
import { PaymentError, PaymentShell, paymentQuietAction, type PaymentTone } from "@/components/payment-shell";
import { apiGet } from "@/lib/api";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { createPaymentCheckout, newIdempotencyKey, type ApiRentalApplication } from "@/lib/rental-applications";
import { useWindowFocusRefresh } from "@/lib/use-window-focus-refresh";

type Props = ComponentProps<typeof DemoPaymentPanel>;
type PaymentStatus = "AWAITING_PAYMENT" | "PROCESSING" | "PAID" | "REFUNDED" | "RELEASED" | "CANCELLED";
type Viewer = "payer" | "host" | "member";
// The amount is set by the payment provider and only shown on its checkout page, so this panel does not guess it.
const statusCopy: Record<PaymentStatus, { label: string; tone: PaymentTone; say: (viewer: Viewer, accepted: boolean) => string }> = {
  AWAITING_PAYMENT: { label: "等待付款", tone: "waiting", say: (viewer, accepted) => viewer !== "payer" ? "等待申请人完成付款。" : accepted ? "转租人接受了你的申请。付款在付款页完成，金额以付款页为准。" : "申请状态变了，现在不能付款。" },
  PROCESSING: { label: "处理中", tone: "neutral", say: () => "付款或退款正在处理，稍后刷新看看。" },
  PAID: { label: "已付款", tone: "done", say: (viewer) => viewer === "payer" ? "付款已完成。" : "申请人已付款。" },
  REFUNDED: { label: "已退款", tone: "neutral", say: () => "这笔付款已退款。" },
  RELEASED: { label: "已结算", tone: "done", say: (viewer) => viewer === "host" ? "款项已结算给你。" : "款项已结算给转租人。" },
  CANCELLED: { label: "付款已取消", tone: "neutral", say: () => "这笔付款已取消。" }
};

export function PaymentPanel(props: Props) {
  // Remount on account/application changes so previous results cannot leak into a new session.
  return <PaymentSession key={`${props.currentUserId}:${props.application.id}:${props.token}`} {...props} />;
}

function PaymentSession(props: Props) {
  const { application, token, currentUserId } = props;
  const [mode, setMode] = useState<"demo" | "production" | null>(null);
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const mounted = useRef(true);
  const busy = useRef(false);
  const loadVersion = useRef(0);
  const onApplicationChange = useRef(props.onApplicationChange);
  onApplicationChange.current = props.onApplicationChange;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const configuration = await apiGet<{ mode: "demo" | "production" }>("/payments/configuration", token);
      if (!mounted.current || version !== loadVersion.current) return;
      if (configuration.mode !== "demo" && configuration.mode !== "production") throw new Error("付款配置暂时不可用。");
      setMode(configuration.mode);
      if (configuration.mode === "production") {
        const [payment, updatedApplication] = await Promise.all([
          apiGet<{ status: PaymentStatus }>(`/payments/applications/${encodeURIComponent(application.id)}`, token),
          onApplicationChange.current ? apiGet<ApiRentalApplication>(`/applications/${encodeURIComponent(application.id)}`, token) : null
        ]);
        if (!mounted.current || version !== loadVersion.current) return;
        if (!(payment.status in statusCopy)) throw new Error("付款状态暂时不可用。");
        setStatus(payment.status);
        if (updatedApplication) onApplicationChange.current?.(updatedApplication);
      }
      setError(null);
    } catch (caught) {
      if (mounted.current && version === loadVersion.current) { setStatus(null); setError(caught instanceof Error ? caught.message : "付款状态暂时无法加载。"); }
    }
  }, [application.id, token]);
  useEffect(() => { void load(); }, [load, application.status]);
  useWindowFocusRefresh(load);

  async function checkout() {
    if (busy.current || currentUserId !== application.submitterId || status !== "AWAITING_PAYMENT" || application.status !== "ACCEPTED") return;
    busy.current = true;
    setPending(true); setError(null);
    try {
      assertCurrentAuthSession(token);
      const storageKey = `sublet_checkout:${encodeURIComponent(currentUserId)}:${encodeURIComponent(application.id)}`;
      const key = localStorage.getItem(storageKey) ?? newIdempotencyKey("checkout");
      localStorage.setItem(storageKey, key);
      const { checkoutUrl } = await createPaymentCheckout(token, application.id, key);
      if (!mounted.current) return;
      assertCurrentAuthSession(token);
      const destination = new URL(checkoutUrl);
      if (destination.protocol !== "https:" || destination.username || destination.password) throw new Error("付款链接无效，请刷新后重试。");
      window.location.assign(destination.href);
    } catch (caught) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "付款暂时无法开始，请重试。");
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }

  if (mode === "demo") return <DemoPaymentPanel {...props} />;
  const viewer: Viewer = currentUserId === application.submitterId ? "payer" : currentUserId === application.listingOwnerId ? "host" : "member";
  const copy = status ? statusCopy[status] : null;
  const canPay = status === "AWAITING_PAYMENT" && application.status === "ACCEPTED" && viewer === "payer";
  return <PaymentShell liveStatus inset={props.inset} status={copy ? copy.label : error ? "状态未确认" : "读取中"} tone={copy ? copy.tone : "neutral"}>
    {copy ? <p className="mt-2 text-d-subhead text-ink-secondary">{copy.say(viewer, application.status === "ACCEPTED")}</p> : null}
    {!copy && !error ? <p className="mt-2 text-d-subhead text-ink-secondary">正在读取付款状态…</p> : null}
    {error ? <PaymentError message={error} /> : null}
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {canPay ? <button type="button" disabled={pending} onClick={() => void checkout()} className="primary-action">{pending ? "正在打开付款…" : "继续付款"}</button> : null}
      <button type="button" disabled={pending} onClick={() => void load()} className={paymentQuietAction}>刷新付款状态</button>
    </div>
  </PaymentShell>;
}
