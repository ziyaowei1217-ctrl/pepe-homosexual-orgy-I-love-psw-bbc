import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoPaymentPanel } from "../components/demo-payment-panel";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("DemoPaymentPanel", () => {
  it("always shows the disclaimer, offers explicit simulations, and never renders credential inputs", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(paymentState("AWAITING_ATTEMPT")))
      .mockResolvedValueOnce(jsonResponse({ ...paymentState("HELD"), heldFund: heldFund() }));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DemoPaymentPanel application={application()} token="token-1" currentUserId="renter-1" />
      );
    });

    expect(text(renderer.root)).toContain("演示模式，不会真实扣款");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
    const success = renderer.root.findAllByType("button").find((node) => text(node).includes("模拟支付成功"))!;
    await act(async () => success.props.onClick());
    expect(text(renderer.root)).toContain("资金已持有");
  });

  it("disables move-in confirmation before the agreed date and explains when it becomes available", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T12:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ...paymentState("HELD"),
      heldFund: heldFund()
    })));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DemoPaymentPanel application={application()} token="token-1" currentUserId="renter-1" />
      );
    });

    const confirm = renderer.root.findAllByType("button").find((node) => text(node).includes("确认已入住"));
    expect(confirm?.props.disabled).toBe(true);
    expect(text(renderer.root)).toContain("2026-09-01 起可确认入住");
  });

  it("renders the immutable double-entry ledger returned by the server", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ...paymentState("HELD"),
      heldFund: heldFund(),
      ledgerEntries: [
        { id: "entry-1", event: "HOLD", account: "RENTER_CLEARING", direction: "DEBIT", amountCents: 185000 },
        { id: "entry-2", event: "HOLD", account: "HELD_FUNDS", direction: "CREDIT", amountCents: 185000 }
      ]
    })));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <DemoPaymentPanel application={application()} token="token-1" currentUserId="renter-1" />
      );
    });

    const rendered = text(renderer.root);
    expect(rendered).toContain("不可变资金流水");
    expect(rendered).toContain("租客清算账户");
    expect(rendered).toContain("托管资金账户");
    expect(rendered).toContain("$1,850.00");
  });
});

function application() {
  return {
    id: "application-1",
    listingId: "listing-1",
    listingOwnerId: "owner-1",
    submitterId: "renter-1",
    teamId: null,
    scope: "SOLO" as const,
    status: "ACCEPTED" as const,
    memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
    moveIn: "2026-09-01T00:00:00.000Z",
    moveOut: "2026-12-31T00:00:00.000Z",
    schoolOrOccupation: "UCLA",
    incomeBand: "TWO_TO_THREE_X" as const,
    guarantorStatus: "AVAILABLE" as const,
    note: ""
  };
}

function heldFund() {
  return { id: "fund-1", paymentId: "payment-1", amountCents: 185000, status: "HELD", renterConfirmedAt: null, ownerConfirmedAt: null };
}

function paymentState(status: string) {
  return {
    disclaimer: "演示模式，不会真实扣款",
    payment: { id: "payment-1", applicationId: "application-1", amountCents: 185000, currency: "USD", status },
    application: application(),
    attempts: [],
    heldFund: null,
    ledgerEntries: []
  };
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
