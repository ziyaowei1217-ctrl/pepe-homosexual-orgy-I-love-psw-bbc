// @vitest-environment jsdom

import TestRenderer, { act } from "./support/dom-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HostApplicationInbox } from "../components/host-application-inbox";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("HostApplicationInbox", () => {
  it("loads the owner-only inbox and requires confirmation before accepting", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([application("SUBMITTED")]))
      .mockResolvedValueOnce(jsonResponse(application("ACCEPTED")))
      .mockResolvedValueOnce(jsonResponse([application("ACCEPTED")]))
      .mockResolvedValueOnce(jsonResponse({ mode: "demo" }))
      .mockResolvedValueOnce(jsonResponse(paymentState()));
    vi.stubGlobal("fetch", fetchMock);
    const confirmDecision = vi.fn(() => true);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <HostApplicationInbox token="token-1" currentUserId="owner-1" confirmDecision={confirmDecision} />
      );
    });

    expect(text(renderer.root)).toContain("等待房东处理");
    expect(text(renderer.root)).toContain("Westwood 阳光主卧");
    expect(text(renderer.root)).not.toContain("房源 listing-1");
    const accept = renderer.root.findAllByType("button").find((node) => text(node).includes("接受申请"))!;
    await act(async () => accept.props.onClick());
    expect(confirmDecision).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/applications/application-1/accept"))).toBe(true);
    expect(text(renderer.root)).toContain("演示模式，不会真实扣款");
  });

  it("lets the owner cancel an accepted application through the server refund flow", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([application("ACCEPTED")]))
      .mockResolvedValueOnce(jsonResponse({ mode: "demo" }))
      .mockResolvedValueOnce(jsonResponse(paymentState()))
      .mockResolvedValueOnce(jsonResponse(application("CANCELLED")))
      .mockResolvedValueOnce(jsonResponse([application("CANCELLED")]));
    vi.stubGlobal("fetch", fetchMock);
    const confirmDecision = vi.fn(() => true);
    const requestReason = vi.fn(() => "房源计划改变");
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <HostApplicationInbox
          token="token-1"
          currentUserId="owner-1"
          confirmDecision={confirmDecision}
          requestReason={requestReason}
        />
      );
    });

    const cancel = renderer.root.findAllByType("button").find((node) => text(node).includes("取消申请"));
    expect(cancel).toBeDefined();
    await act(async () => cancel!.props.onClick());

    expect(confirmDecision).toHaveBeenCalledWith("确认取消已接受的申请？持有资金会按服务端状态退款。");
    expect(requestReason).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/applications/application-1/cancel"))).toBe(true);
    expect(text(renderer.root)).toContain("申请已取消");
  });
});

function application(status: string) {
  return {
    id: "application-1",
    listingId: "listing-1",
    listingTitle: "Westwood 阳光主卧",
    listingOwnerId: "owner-1",
    submitterId: "renter-1",
    teamId: null,
    scope: "SOLO",
    status,
    memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
    moveIn: "2026-09-01T00:00:00.000Z",
    moveOut: "2026-12-31T00:00:00.000Z",
    schoolOrOccupation: "UCLA student",
    incomeBand: "TWO_TO_THREE_X",
    guarantorStatus: "AVAILABLE",
    note: "Quiet"
  };
}

function paymentState() {
  return {
    disclaimer: "演示模式，不会真实扣款",
    payment: { id: "payment-1", applicationId: "application-1", amountCents: 185000, currency: "USD", status: "AWAITING_ATTEMPT" },
    application: application("ACCEPTED"),
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
