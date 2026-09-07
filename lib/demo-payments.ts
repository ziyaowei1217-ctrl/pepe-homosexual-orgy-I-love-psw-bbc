import { apiGet, apiPostIdempotent } from "./api";
import { localDate } from "./listing-stay";
import type { ApiRentalApplication } from "./rental-applications";

export const DEMO_PAYMENT_DISCLAIMER = "演示模式，不会真实扣款";

export type ApiDemoPaymentState = {
  disclaimer: string;
  payment: {
    id: string;
    applicationId: string;
    amountCents: number;
    currency: string;
    status: "AWAITING_ATTEMPT" | "HELD" | "REFUNDED" | "RELEASED" | "CLOSED";
  };
  application: ApiRentalApplication;
  attempts: Array<{ id: string; outcome: "SUCCEEDED" | "FAILED"; applied: boolean; createdAt: string }>;
  heldFund: null | {
    id: string;
    paymentId: string;
    amountCents: number;
    status: "HELD" | "REFUNDED" | "RELEASED";
    renterConfirmedAt: string | null;
    ownerConfirmedAt: string | null;
  };
  ledgerEntries: Array<{
    id: string;
    event: "HOLD" | "REFUND" | "RELEASE";
    account: string;
    direction: "DEBIT" | "CREDIT";
    amountCents: number;
  }>;
};

export function getDemoPaymentState(token: string, applicationId: string) {
  return apiGet<ApiDemoPaymentState>(`/demo-payments/by-application/${encodeURIComponent(applicationId)}`, token);
}

export function simulateDemoPayment(token: string, applicationId: string, outcome: "success" | "failure", key: string) {
  return apiPostIdempotent<ApiDemoPaymentState>(
    `/demo-payments/by-application/${encodeURIComponent(applicationId)}/simulate-${outcome}`,
    {},
    token,
    key
  );
}

export function confirmDemoMoveIn(token: string, heldFundId: string, key: string) {
  return apiPostIdempotent<ApiDemoPaymentState>(
    `/demo-held-funds/${encodeURIComponent(heldFundId)}/confirm-move-in`,
    {},
    token,
    key
  );
}

export function demoPaymentStatusLabel(status: ApiDemoPaymentState["payment"]["status"]) {
  return {
    AWAITING_ATTEMPT: "等待演示支付",
    HELD: "资金已持有",
    REFUNDED: "资金已退回",
    RELEASED: "资金已释放",
    CLOSED: "订单已关闭"
  }[status];
}

export function canConfirmDemoMoveIn(moveIn: string, now = Date.now()) {
  const day = moveIn.slice(0, 10);
  const moveInAt = Date.parse(`${day}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(moveInAt) && Number.isFinite(now) &&
    new Date(moveInAt).toISOString().slice(0, 10) === day && localDate(new Date(now)) >= day;
}

export function demoLedgerAccountLabel(account: string) {
  return {
    RENTER_CLEARING: "租客清算账户",
    HELD_FUNDS: "托管资金账户",
    HOST_CLEARING: "房东清算账户"
  }[account] ?? account;
}
