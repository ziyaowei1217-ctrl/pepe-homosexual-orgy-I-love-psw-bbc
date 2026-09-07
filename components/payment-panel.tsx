"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { DemoPaymentPanel } from "@/components/demo-payment-panel";
import { apiGet } from "@/lib/api";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { createPaymentCheckout, newIdempotencyKey, type ApiRentalApplication } from "@/lib/rental-applications";
import { useWindowFocusRefresh } from "@/lib/use-window-focus-refresh";

type Props = ComponentProps<typeof DemoPaymentPanel>;
type PaymentStatus = "AWAITING_PAYMENT" | "PROCESSING" | "PAID" | "REFUNDED" | "RELEASED" | "CANCELLED";
const labels: Record<PaymentStatus, string> = {
  AWAITING_PAYMENT: "等待付款", PROCESSING: "付款或退款处理中，请稍后刷新", PAID: "已付款",
  REFUNDED: "已退款", RELEASED: "资金已结算", CANCELLED: "付款已取消"
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
        if (!(payment.status in labels)) throw new Error("付款状态暂时不可用。");
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
  return <section aria-label="付款状态" className="space-y-3 rounded-2xl border bg-white p-5">
    <h2 className="font-bold">付款与资金状态</h2>
    <p role="status">{status ? labels[status] : error ? "付款状态未确认" : "正在读取付款状态…"}</p>
    {status === "AWAITING_PAYMENT" && application.status === "ACCEPTED" ? currentUserId === application.submitterId
      ? <button disabled={pending} onClick={() => void checkout()} className="primary-action">{pending ? "正在打开付款…" : "继续付款"}</button>
      : <p>等待申请人完成付款。</p> : null}
    <button disabled={pending} onClick={() => void load()} className="secondary-action">刷新付款状态</button>
    {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
  </section>;
}
