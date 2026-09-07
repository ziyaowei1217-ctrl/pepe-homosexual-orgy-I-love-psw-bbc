// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DemoPaymentPanel } from "../components/demo-payment-panel";
import type { ApiRentalApplication } from "../lib/rental-applications";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const application: ApiRentalApplication = {
  id: "app-1", listingId: "listing-1", listingOwnerId: "host", submitterId: "renter", teamId: null,
  scope: "SOLO", status: "ACCEPTED", memberSnapshots: [{ userId: "renter", displayName: "Lin" }],
  moveIn: "2026-10-01", moveOut: "2027-02-28", schoolOrOccupation: "UCLA", incomeBand: "ABOVE_FOUR_X",
  guarantorStatus: "NOT_AVAILABLE", note: ""
};

function state(status: string, applicationStatus: ApiRentalApplication["status"] = "ACCEPTED") {
  return { disclaimer: "演示模式，不会真实扣款", application: { ...application, status: applicationStatus },
    payment: { id: "payment-1", applicationId: "app-1", amountCents: 168000, currency: "USD", status },
    attempts: [], heldFund: null, ledgerEntries: [] };
}

it("refreshes a cancelled order and immediately removes its payment actions", async () => {
  let closeOrder!: (response: Response) => void;
  const closed = new Promise<Response>((resolve) => { closeOrder = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(state("AWAITING_ATTEMPT"))).mockReturnValueOnce(closed));
  const view = render(<DemoPaymentPanel application={application} token="token" currentUserId="renter" />);
  await screen.findByRole("button", { name: "模拟支付成功" });
  view.rerender(<DemoPaymentPanel application={{ ...application, status: "CANCELLED" }} token="token" currentUserId="renter" />);
  expect(screen.queryByRole("button", { name: "模拟支付成功" })).toBeNull();
  await act(async () => { closeOrder(Response.json(state("CLOSED", "CANCELLED"))); });
  expect(await screen.findByText("订单已关闭")).toBeDefined();
  expect(screen.queryByText("等待演示支付")).toBeNull();
});

it("does not let an older read reopen a payment after cancellation refresh", async () => {
  let oldResponse!: (response: Response) => void;
  const oldRead = new Promise<Response>((resolve) => { oldResponse = resolve; });
  vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(oldRead).mockResolvedValueOnce(Response.json(state("CLOSED", "CANCELLED"))));
  const view = render(<DemoPaymentPanel application={application} token="token" currentUserId="renter" />);
  view.rerender(<DemoPaymentPanel application={{ ...application, status: "CANCELLED" }} token="token" currentUserId="renter" />);
  await screen.findByText("订单已关闭");
  await act(async () => { oldResponse(Response.json(state("AWAITING_ATTEMPT"))); });
  expect(screen.getByText("订单已关闭")).toBeDefined();
  expect(screen.queryByText("等待演示支付")).toBeNull();
});
