import TestRenderer, { act } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationStatusPanel } from "../components/application-status-panel";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllGlobals());

describe("ApplicationStatusPanel", () => {
  it("recovers accepted applications and their payment timeline after remount", async () => {
    const application = {
      id: "application-1", listingId: "listing-1", listingOwnerId: "owner-1", submitterId: "renter-1", teamId: null,
      scope: "SOLO", status: "ACCEPTED", memberSnapshots: [{ userId: "renter-1", displayName: "Lin" }],
      moveIn: "2026-09-01T00:00:00.000Z", moveOut: "2026-12-31T00:00:00.000Z", schoolOrOccupation: "UCLA",
      incomeBand: "TWO_TO_THREE_X", guarantorStatus: "AVAILABLE", note: ""
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse([application]))
      .mockResolvedValueOnce(jsonResponse({
        disclaimer: "演示模式，不会真实扣款",
        payment: { id: "payment-1", applicationId: "application-1", amountCents: 185000, currency: "USD", status: "HELD" },
        application,
        attempts: [],
        heldFund: { id: "fund-1", paymentId: "payment-1", amountCents: 185000, status: "HELD", renterConfirmedAt: null, ownerConfirmedAt: null },
        ledgerEntries: []
      }));
    vi.stubGlobal("fetch", fetchMock);
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(<ApplicationStatusPanel token="token-1" currentUserId="renter-1" />);
    });

    expect(text(renderer.root)).toContain("申请已接受");
    expect(text(renderer.root)).toContain("资金已持有");
    expect(text(renderer.root)).toContain("演示模式，不会真实扣款");
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children.map((child) => typeof child === "string" ? child : text(child)).join("");
}
