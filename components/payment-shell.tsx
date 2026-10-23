import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PaymentTone = "waiting" | "done" | "neutral";

const tones: Record<PaymentTone, string> = {
  waiting: "bg-warning-soft text-warning-text",
  done: "bg-success-soft text-success-text",
  neutral: "bg-tag-neutral text-ink-secondary"
};

/**
 * The payment panel's frame, shared by real and demo payments: one heading, one status label, a sentence on what it
 * means, then at most one primary action. Flat like the application card above it.
 */
export function PaymentShell({ status, tone, liveStatus = false, inset = false, children }: {
  status: string;
  /** Inside another card (the host's application card): an outlined block instead of a second white card. */
  inset?: boolean;
  tone: PaymentTone;
  /** Announce status changes (the real payment status is only known after a round trip). */
  liveStatus?: boolean;
  children?: ReactNode;
}) {
  return <section aria-label="付款状态" className={inset ? "rounded-psw-lg border border-line-strong p-4 sm:p-5" : "rounded-psw-xl bg-surface p-5 sm:p-8"}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-m-headline text-ink sm:text-d-headline">付款</h2>
      <span role={liveStatus ? "status" : undefined} className={cn("rounded-psw-sm px-2.5 py-1 text-m-footnote font-bold", tones[tone])}>{status}</span>
    </div>
    {children}
  </section>;
}

/** The amount block, the same shape as 房租总价 on the application card. */
export function PaymentAmount({ label, amount, detail, note }: { label: string; amount: string; detail?: string; note?: string }) {
  return <div className="mt-5 rounded-psw-lg bg-surface-subtle p-4">
    <p className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-m-footnote text-ink-secondary">{label}</span>
      <span className="font-display text-[22px] font-extrabold leading-7 text-primary-text">{amount}</span>
      {detail ? <span className="text-m-footnote text-ink-secondary">· {detail}</span> : null}
    </p>
    {note ? <p className="text-m-footnote text-ink-secondary">{note}</p> : null}
  </div>;
}

export const paymentQuietAction = "inline-flex min-h-11 items-center rounded-full px-4 font-rounded text-sm font-bold text-primary-text transition-colors hover:bg-primary-soft disabled:opacity-50";

export function PaymentError({ message }: { message: string }) {
  return <p role="alert" className="mt-4 rounded-psw-md bg-danger-soft p-4 text-d-subhead font-semibold text-danger-text">{message}</p>;
}
