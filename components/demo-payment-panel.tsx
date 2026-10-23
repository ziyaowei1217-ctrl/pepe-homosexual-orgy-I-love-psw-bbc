"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CheckCircle2, Circle, Info } from "lucide-react";

import { PaymentAmount, PaymentError, PaymentShell, paymentQuietAction, type PaymentTone } from "@/components/payment-shell";
import { assertCurrentAuthSession } from "@/lib/auth-session";
import { formatDateLong } from "@/lib/date-format";
import {
  DEMO_PAYMENT_DISCLAIMER,
  canConfirmDemoMoveIn,
  demoLedgerAccountLabel,
  demoLedgerEventLabel,
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
  onApplicationChange,
  inset = false
}: {
  application: ApiRentalApplication;
  token: string;
  currentUserId: string;
  onApplicationChange?: (application: ApiRentalApplication) => void;
  inset?: boolean;
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
  const canSimulate = payment?.status === "AWAITING_ATTEMPT" && isRenter && application.status === "ACCEPTED";
  const tone: PaymentTone = !payment ? "neutral" : payment.status === "AWAITING_ATTEMPT" ? "waiting" : payment.status === "HELD" || payment.status === "RELEASED" ? "done" : "neutral";

  return (
    <PaymentShell inset={inset} status={payment ? demoPaymentStatusLabel(payment.status) : "读取中"} tone={tone}>
      <p className="mt-3 flex items-start gap-2 rounded-psw-md bg-surface-subtle p-3 text-d-subhead font-semibold text-ink"><Info className="mt-0.5 size-4 shrink-0 text-primary-text" aria-hidden="true" />{DEMO_PAYMENT_DISCLAIMER}。下面的按钮只用来模拟付款结果。</p>
      {payment ? <PaymentAmount label="付款金额" amount={money(payment.amountCents, payment.currency)} detail={application.scope === "TEAM" ? "两人小组申请" : "个人申请"} note={amountNote[payment.status]} /> : null}
      {state?.attempts.at(-1)?.outcome === "FAILED" && canSimulate ? <p className="mt-4 text-d-subhead font-semibold text-danger-text">上次模拟付款失败，可以再试；没有真实扣款。</p> : null}
      {heldFund ? <ul className="mt-5 grid gap-2" aria-label="确认入住">
        <ConfirmRow done={Boolean(heldFund.renterConfirmedAt)} label={isRenter ? "你确认入住" : "租客确认入住"} />
        <ConfirmRow done={Boolean(heldFund.ownerConfirmedAt)} label={isOwner ? "你确认入住" : "转租人确认入住"} />
      </ul> : null}
      {needsConfirmation && !moveInEligible ? <p className="mt-3 text-m-footnote text-ink-secondary">{formatDateLong(application.moveIn.slice(0, 10))}起可确认入住。</p> : null}
      {canSimulate || needsConfirmation ? <div className="mt-5 flex flex-wrap items-center gap-2">
        {canSimulate ? <><button type="button" disabled={pending} onClick={() => void run("success")} className="primary-action">模拟支付成功</button><button type="button" disabled={pending} onClick={() => void run("failure")} className={paymentQuietAction}>模拟支付失败</button></> : null}
        {needsConfirmation ? <button type="button" disabled={pending || !canConfirm} onClick={() => void run("confirm")} className="primary-action disabled:opacity-50">确认已入住</button> : null}
      </div> : null}
      {state?.ledgerEntries.length ? <details className="group mt-5 rounded-psw-lg border border-line-strong">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 font-rounded text-sm font-bold text-ink">查看资金流水<span className="text-m-footnote font-normal text-ink-secondary group-open:hidden">{state.ledgerEntries.length} 条</span></summary>
        <div className="border-t border-line-strong px-4 pb-4 pt-3">
          <p className="text-m-footnote text-ink-secondary">每笔事件按借贷成对记录，历史记录不可修改。</p>
          <ul className="mt-2 grid gap-1.5">
            {state.ledgerEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-m-footnote text-ink-secondary">
                <span>{demoLedgerEventLabel(entry.event)} · {demoLedgerAccountLabel(entry.account)} · {entry.direction === "DEBIT" ? "借记" : "贷记"}</span>
                <span className="font-semibold tabular-nums text-ink">{money(entry.amountCents, "USD", true)}</span>
              </li>
            ))}
          </ul>
        </div>
      </details> : null}
      {pending ? <p className="mt-4 text-m-footnote text-ink-secondary">正在同步付款状态…</p> : null}
      {error ? <PaymentError message={error} /> : null}
    </PaymentShell>
  );
}

const amountNote: Record<ApiDemoPaymentState["payment"]["status"], string> = {
  AWAITING_ATTEMPT: "付款后由平台代管，你和转租人都确认入住后才转给转租人。",
  HELD: "平台代管中，双方都确认入住后转给转租人。",
  RELEASED: "双方都确认了入住，款项已转给转租人。",
  REFUNDED: "款项已退回给租客。",
  CLOSED: "订单已关闭。"
};

function ConfirmRow({ done, label }: { done: boolean; label: string }) {
  const Icon = done ? CheckCircle2 : Circle;
  return <li className="flex items-center justify-between gap-3 text-d-subhead">
    <span className="flex items-center gap-2 text-ink"><Icon className={done ? "size-5 text-success-text" : "size-5 text-line-strong"} aria-hidden="true" />{label}</span>
    <span className={done ? "font-semibold text-success-text" : "text-ink-secondary"}>{done ? "已确认" : "待确认"}</span>
  </li>;
}

/** Whole dollars read like every other price on the site; the ledger keeps the cents. */
function money(cents: number, currency: string, exact = false) {
  const dollars = cents / 100;
  const text = `$${dollars.toLocaleString("en-US", { minimumFractionDigits: exact || !Number.isInteger(dollars) ? 2 : 0, maximumFractionDigits: 2 })}`;
  return currency === "USD" ? text : `${text} ${currency}`;
}
